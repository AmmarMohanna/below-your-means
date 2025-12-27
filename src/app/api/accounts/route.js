import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAuthenticated } from '@/lib/auth';
import {
  getAllCurrentMoney,
  addCurrentMoney,
  updateCurrentMoney,
  deleteCurrentMoney,
  getAllExpectedMoney,
  addExpectedMoney,
  updateExpectedMoney,
  deleteExpectedMoney,
  getAllPayables,
  addPayable,
  updatePayable,
  deletePayable,
  getAllRecurring,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  getAllHeldMoney,
  addHeldMoney,
  updateHeldMoney,
  deleteHeldMoney,
} from '@/lib/db';

// GET all data for all tables
export async function GET() {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentMoney = getAllCurrentMoney();
    const expectedMoney = getAllExpectedMoney();
    const payables = getAllPayables();
    const recurring = getAllRecurring();
    const heldMoney = getAllHeldMoney();

    return NextResponse.json({
      currentMoney,
      expectedMoney,
      payables,
      recurring,
      heldMoney,
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

// POST - add new item to any table
export async function POST(request) {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { table, ...data } = body;

    let result;
    switch (table) {
      case 'currentMoney':
        result = addCurrentMoney(data);
        break;
      case 'expectedMoney':
        result = addExpectedMoney(data);
        break;
      case 'payables':
        result = addPayable(data);
        break;
      case 'recurring':
        result = addRecurring(data);
        break;
      case 'heldMoney':
        result = addHeldMoney(data);
        break;
      default:
        return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding item:', error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}

// PUT - update item in any table
export async function PUT(request) {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { table, id, ...data } = body;

    switch (table) {
      case 'currentMoney':
        updateCurrentMoney(id, data);
        break;
      case 'expectedMoney':
        updateExpectedMoney(id, data);
        break;
      case 'payables':
        updatePayable(id, data);
        break;
      case 'recurring':
        updateRecurring(id, data);
        break;
      case 'heldMoney':
        updateHeldMoney(id, data);
        break;
      default:
        return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE - delete item from any table
export async function DELETE(request) {
  const cookieStore = await cookies();
  if (!isAuthenticated(cookieStore)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const id = searchParams.get('id');

    if (!table || !id) {
      return NextResponse.json({ error: 'Missing table or id' }, { status: 400 });
    }

    switch (table) {
      case 'currentMoney':
        deleteCurrentMoney(id);
        break;
      case 'expectedMoney':
        deleteExpectedMoney(id);
        break;
      case 'payables':
        deletePayable(id);
        break;
      case 'recurring':
        deleteRecurring(id);
        break;
      case 'heldMoney':
        deleteHeldMoney(id);
        break;
      default:
        return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}

