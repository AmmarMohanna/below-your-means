import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import {
  getAllTransactions,
  addTransaction,
  getTransactionsByDateRange,
  bulkDeleteTransactions,
} from '@/lib/db';

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
      transactions = await getTransactionsByDateRange(startDate, endDate);
    } else {
      transactions = await getAllTransactions();
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
    const { amount, category, type, scope, notes, date, created_at } = data;
    const transactionAmount = Number(amount);

    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0 || !category || !type || !date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await addTransaction({
      amount: transactionAmount,
      category,
      type,
      scope,
      notes,
      date,
      created_at,
    });
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, ids } = await request.json();

    if (action !== 'bulkDelete' || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Invalid bulk action' }, { status: 400 });
    }

    await bulkDeleteTransactions(ids.map((id) => Number(id)).filter(Boolean));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error applying bulk transaction action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
