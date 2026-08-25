import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getLongTermSavings,
  getMetals,
  updateMetals,
  updateMetalPrices,
} from '@/lib/db';

// GET metals data with stored prices (no external API calls)
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let metals = (await getMetals()) || {
      gold_24k_grams: 0, 
      gold_21k_grams: 0, 
      silver_kg: 0,
      gold_24k_price_per_gram: 85,
      gold_21k_price_per_gram: 74.4,
      silver_price_per_kg: 950,
      prices_fetched_at: null
    };
    const longTermSavings = (await getLongTermSavings()) || {
      aub_pension_amount: 0,
      cash_savings_amount: 0,
    };
    
    // Build response with stored prices
    const prices = {
      gold_24k_per_gram: metals.gold_24k_price_per_gram || 85,
      gold_21k_per_gram: metals.gold_21k_price_per_gram || 74.4,
      silver_per_kg: metals.silver_price_per_kg || 950,
      last_updated: metals.prices_fetched_at || metals.updated_at,
      source: metals.prices_fetched_at ? 'gold-api.com' : 'manual'
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
      },
      longTermSavings: {
        aub_pension_amount: longTermSavings.aub_pension_amount || 0,
        cash_savings_amount: longTermSavings.cash_savings_amount || 0,
        total:
          totalValue +
          (longTermSavings.aub_pension_amount || 0) +
          (longTermSavings.cash_savings_amount || 0),
      }
    });
  } catch (error) {
    console.error('Error fetching metals:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

// PUT update metals holdings
export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gold_24k_grams, gold_21k_grams, silver_kg } = body;
    
    await updateMetals({
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

// PATCH update metal prices manually
export async function PATCH(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      gold_24k_price_per_gram,
      gold_21k_price_per_gram,
      silver_price_per_kg,
      fromApi = false,
    } = body;
    
    await updateMetalPrices({
      gold_24k_price_per_gram: gold_24k_price_per_gram || 85,
      gold_21k_price_per_gram: gold_21k_price_per_gram || 74.4,
      silver_price_per_kg: silver_price_per_kg || 950,
      fromApi,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating metal prices:', error);
    return NextResponse.json({ error: 'Failed to update prices' }, { status: 500 });
  }
}
