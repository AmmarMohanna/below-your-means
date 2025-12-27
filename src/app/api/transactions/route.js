import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getAllTransactions, addTransaction, getTransactionsByDateRange } from '@/lib/db';

export async function GET(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let transactions;
    if (startDate && endDate) {
      transactions = getTransactionsByDateRange(startDate, endDate);
    } else {
      transactions = getAllTransactions();
    }

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { amount, category, type, notes, date } = data;

    if (!amount || !category || !type || !date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = addTransaction({ amount: parseFloat(amount), category, type, notes, date });
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

