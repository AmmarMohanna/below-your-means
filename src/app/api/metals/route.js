import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthenticated } from '@/lib/auth';
import { getMetals, updateMetals } from '@/lib/db';

// Fetch current metal prices from free API
async function fetchMetalPrices() {
  try {
    // Using goldapi.io with free demo - XAU is gold, XAG is silver (prices in USD per troy oz)
    const [goldRes, silverRes] = await Promise.all([
      fetch('https://data-asg.goldprice.org/dbXRates/USD', {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }),
      fetch('https://data-asg.goldprice.org/dbXRates/USD', {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      })
    ]);
    
    if (!goldRes.ok) {
      throw new Error('Failed to fetch gold price');
    }
    
    const goldData = await goldRes.json();
    
    // goldprice.org returns gold and silver per oz
    // items[0].xauPrice = gold price per oz, items[0].xagPrice = silver price per oz
    const goldPricePerOz = goldData.items?.[0]?.xauPrice || 0;
    const silverPricePerOz = goldData.items?.[0]?.xagPrice || 0;
    
    // Convert from USD/troy oz to USD/gram (1 troy oz = 31.1035 grams)
    const goldPerGram = goldPricePerOz / 31.1035;
    const silverPerGram = silverPricePerOz / 31.1035;
    
    return {
      gold_24k_per_gram: goldPerGram,
      gold_21k_per_gram: goldPerGram * (21 / 24), // 21k is 87.5% pure
      silver_per_gram: silverPerGram,
      silver_per_kg: silverPerGram * 1000,
      last_updated: new Date().toISOString(),
      source: 'goldprice.org'
    };
  } catch (error) {
    console.error('Error fetching metal prices:', error);
    // Fallback to approximate prices if API fails
    return {
      gold_24k_per_gram: 85, // ~$85/gram as fallback (updated Jan 2025)
      gold_21k_per_gram: 74.4, // 21k adjusted
      silver_per_gram: 0.95,
      silver_per_kg: 950,
      last_updated: null,
      source: 'fallback',
      error: 'Could not fetch live prices'
    };
  }
}

// GET metals data and current prices
export async function GET() {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const metals = getMetals() || { gold_24k_grams: 0, gold_21k_grams: 0, silver_kg: 0 };
    const prices = await fetchMetalPrices();
    
    // Calculate totals
    const gold24kValue = metals.gold_24k_grams * prices.gold_24k_per_gram;
    const gold21kValue = metals.gold_21k_grams * prices.gold_21k_per_gram;
    const silverValue = metals.silver_kg * prices.silver_per_kg;
    const totalValue = gold24kValue + gold21kValue + silverValue;

    return NextResponse.json({
      holdings: metals,
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

