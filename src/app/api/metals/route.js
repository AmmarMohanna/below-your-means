import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthenticated } from '@/lib/auth';
import { getMetals, updateMetals, updateMetalPrices } from '@/lib/db';

// Cache duration: 1 hour in milliseconds
const CACHE_DURATION_MS = 60 * 60 * 1000;

// Fetch current metal prices from goldprice.org (rate-limited to once per hour)
async function fetchMetalPricesFromApi() {
  try {
    const response = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // goldprice.org returns gold and silver per oz
    // items[0].xauPrice = gold price per oz, items[0].xagPrice = silver price per oz
    const goldPricePerOz = data.items?.[0]?.xauPrice;
    const silverPricePerOz = data.items?.[0]?.xagPrice;
    
    if (!goldPricePerOz || !silverPricePerOz) {
      throw new Error('Invalid API response structure');
    }
    
    // Convert from USD/troy oz to USD/gram (1 troy oz = 31.1035 grams)
    const goldPerGram = goldPricePerOz / 31.1035;
    const silverPerGram = silverPricePerOz / 31.1035;
    
    return {
      gold_24k_price_per_gram: goldPerGram,
      gold_21k_price_per_gram: goldPerGram * (21 / 24), // 21k is 87.5% pure
      silver_price_per_kg: silverPerGram * 1000,
      success: true
    };
  } catch (error) {
    console.error('Error fetching metal prices from API:', error.message);
    return { success: false, error: error.message };
  }
}

// Check if cache is stale (older than 1 hour)
function isCacheStale(pricesFetchedAt) {
  if (!pricesFetchedAt) return true;
  
  const fetchedTime = new Date(pricesFetchedAt).getTime();
  const now = Date.now();
  
  return (now - fetchedTime) > CACHE_DURATION_MS;
}

// GET metals data with cached prices (fetches from API once per hour)
export async function GET() {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let metals = getMetals() || { 
      gold_24k_grams: 0, 
      gold_21k_grams: 0, 
      silver_kg: 0,
      gold_24k_price_per_gram: 85,
      gold_21k_price_per_gram: 74.4,
      silver_price_per_kg: 950,
      prices_fetched_at: null
    };
    
    let priceSource = 'cached';
    
    // Check if we need to refresh prices from API (once per hour)
    if (isCacheStale(metals.prices_fetched_at)) {
      console.log('Metal prices cache stale, fetching from API...');
      const apiPrices = await fetchMetalPricesFromApi();
      
      if (apiPrices.success) {
        // Update prices in database
        updateMetalPrices({
          gold_24k_price_per_gram: apiPrices.gold_24k_price_per_gram,
          gold_21k_price_per_gram: apiPrices.gold_21k_price_per_gram,
          silver_price_per_kg: apiPrices.silver_price_per_kg,
          fromApi: true
        });
        
        // Refresh metals data
        metals = getMetals();
        priceSource = 'goldprice.org';
        console.log('Metal prices updated from API');
      } else {
        console.log('API fetch failed, using cached/default prices');
        priceSource = metals.prices_fetched_at ? 'cached' : 'default';
      }
    }
    
    // Build response
    const prices = {
      gold_24k_per_gram: metals.gold_24k_price_per_gram || 85,
      gold_21k_per_gram: metals.gold_21k_price_per_gram || 74.4,
      silver_per_kg: metals.silver_price_per_kg || 950,
      last_updated: metals.prices_fetched_at || metals.updated_at,
      source: priceSource
    };
    
    // Calculate totals
    const gold24kValue = metals.gold_24k_grams * prices.gold_24k_per_gram;
    const gold21kValue = metals.gold_21k_grams * prices.gold_21k_per_gram;
    const silverValue = metals.silver_kg * prices.silver_per_kg;
    const totalValue = gold24kValue + gold21kValue + silverValue;

    return NextResponse.json({
      holdings: {
        gold_24k_grams: metals.gold_24k_grams,
        gold_21k_grams: metals.gold_21k_grams,
        silver_kg: metals.silver_kg
      },
      prices,
      values: {
        gold_24k: gold24kValue,
        gold_21k: gold21kValue,
        silver: silverValue,
        total: totalValue
      }
    });
  } catch (error) {
    console.error('Error fetching metals:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

// PUT update metals holdings
export async function PUT(request) {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gold_24k_grams, gold_21k_grams, silver_kg } = body;
    
    updateMetals({
      gold_24k_grams: gold_24k_grams || 0,
      gold_21k_grams: gold_21k_grams || 0,
      silver_kg: silver_kg || 0
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating metals:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// PATCH update metal prices (manual price update - overrides API cache)
export async function PATCH(request) {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gold_24k_price_per_gram, gold_21k_price_per_gram, silver_price_per_kg } = body;
    
    updateMetalPrices({
      gold_24k_price_per_gram: gold_24k_price_per_gram || 85,
      gold_21k_price_per_gram: gold_21k_price_per_gram || 74.4,
      silver_price_per_kg: silver_price_per_kg || 950,
      fromApi: true  // Mark as "fresh" so it won't immediately refetch
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating metal prices:', error);
    return NextResponse.json({ error: 'Failed to update prices' }, { status: 500 });
  }
}
