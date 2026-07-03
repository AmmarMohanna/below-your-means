import { NextResponse } from 'next/server';
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
  shiftDatedAccountItem,
  completeExpectedMoney,
  completePayable,
} from '@/lib/db';

// GET all data for all tables
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentMoney = await getAllCurrentMoney();
    const expectedMoney = await getAllExpectedMoney();
    const payables = await getAllPayables();
    const recurring = await getAllRecurring();
    const heldMoney = await getAllHeldMoney();

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
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { table, ...data } = body;

    let result;
    switch (table) {
      case 'currentMoney':
        result = await addCurrentMoney(data);
        break;
      case 'expectedMoney':
        result = await addExpectedMoney(data);
        break;
      case 'payables':
        result = await addPayable(data);
        break;
      case 'recurring':
        result = await addRecurring(data);
        break;
      case 'heldMoney':
        result = await addHeldMoney(data);
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
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { table, id, ...data } = body;

    switch (table) {
      case 'currentMoney':
        await updateCurrentMoney(id, data);
        break;
      case 'expectedMoney':
        await updateExpectedMoney(id, data);
        break;
      case 'payables':
        await updatePayable(id, data);
        break;
      case 'recurring':
        await updateRecurring(id, data);
        break;
      case 'heldMoney':
        await updateHeldMoney(id, data);
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
  if (!(await isAuthenticated())) {
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
        await deleteCurrentMoney(id);
        break;
      case 'expectedMoney':
        await deleteExpectedMoney(id);
        break;
      case 'payables':
        await deletePayable(id);
        break;
      case 'recurring':
        await deleteRecurring(id);
        break;
      case 'heldMoney':
        await deleteHeldMoney(id);
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

// PATCH - shift dated account items earlier/later
export async function PATCH(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, table, id, direction, date, scope } = await request.json();

    if (!table || !id) {
      return NextResponse.json({ error: 'Missing table or id' }, { status: 400 });
    }

    if (action === 'complete') {
      switch (table) {
        case 'expectedMoney':
          await completeExpectedMoney(Number(id), { date, scope });
          break;
        case 'payables':
          await completePayable(Number(id), { date, scope });
          break;
        default:
          return NextResponse.json({ error: 'Invalid completion table' }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (!direction) {
      return NextResponse.json({ error: 'Missing table, id, or direction' }, { status: 400 });
    }

    await shiftDatedAccountItem(table, Number(id), direction);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error shifting dated item:', error);
    return NextResponse.json({ error: 'Failed to reorder item' }, { status: 500 });
  }
}
