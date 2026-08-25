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
  getAllProjects,
  addProject,
  updateProject,
  deleteProject,
  shiftProject,
  shiftDatedAccountItem,
  completeExpectedMoney,
  completePayable,
} from '@/lib/db';

function validateExpectedPlan(data) {
  const amount = Number(data.amount);
  const plannedSaveAmount =
    data.planned_save_amount === '' || data.planned_save_amount === null || data.planned_save_amount === undefined
      ? 0
      : Number(data.planned_save_amount);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(plannedSaveAmount) ||
    plannedSaveAmount < 0 ||
    plannedSaveAmount > amount
  ) {
    return null;
  }

  return { ...data, amount, planned_save_amount: plannedSaveAmount };
}

// GET all data for all tables
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentMoney = await getAllCurrentMoney();
    const projects = await getAllProjects();
    const expectedMoney = await getAllExpectedMoney();
    const payables = await getAllPayables();
    const recurring = await getAllRecurring();

    return NextResponse.json({
      currentMoney,
      projects,
      expectedMoney,
      payables,
      recurring,
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

    const normalizedData = table === 'expectedMoney' ? validateExpectedPlan(data) : data;
    if (!normalizedData) {
      return NextResponse.json(
        { error: 'Planned savings must be between zero and the expected amount' },
        { status: 400 }
      );
    }

    let result;
    switch (table) {
      case 'currentMoney':
        result = await addCurrentMoney(normalizedData);
        break;
      case 'expectedMoney':
        result = await addExpectedMoney(normalizedData);
        break;
      case 'payables':
        result = await addPayable(normalizedData);
        break;
      case 'recurring':
        result = await addRecurring(normalizedData);
        break;
      case 'projects':
        result = await addProject(normalizedData);
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

    const normalizedData = table === 'expectedMoney' ? validateExpectedPlan(data) : data;
    if (!normalizedData) {
      return NextResponse.json(
        { error: 'Planned savings must be between zero and the expected amount' },
        { status: 400 }
      );
    }

    switch (table) {
      case 'currentMoney':
        await updateCurrentMoney(id, normalizedData);
        break;
      case 'expectedMoney':
        await updateExpectedMoney(id, normalizedData);
        break;
      case 'payables':
        await updatePayable(id, normalizedData);
        break;
      case 'recurring':
        await updateRecurring(id, normalizedData);
        break;
      case 'projects':
        await updateProject(id, normalizedData);
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
      case 'projects':
        await deleteProject(id);
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

    if (table === 'projects') {
      await shiftProject(Number(id), direction);
    } else {
      await shiftDatedAccountItem(table, Number(id), direction);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error shifting dated item:', error);
    const isValidationError = /not found/i.test(error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to update item' },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
