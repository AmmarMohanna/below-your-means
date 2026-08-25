import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import {
  addSavingsPlanItem,
  deleteSavingsPlanItem,
  getSavingsPlan,
  updateSavingsPlanItem,
} from '@/lib/db';

function isValidDate(value) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateItem(data) {
  const source = String(data.source || '').trim();
  const plannedDate = data.planned_date ? String(data.planned_date) : null;
  const amount = Number(data.amount);
  const notes = data.notes ? String(data.notes) : null;

  if (!source || !Number.isFinite(amount) || amount <= 0 || !isValidDate(plannedDate)) {
    return null;
  }

  return { source, planned_date: plannedDate, amount, notes };
}

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await getSavingsPlan());
  } catch (error) {
    console.error('Error fetching savings plan:', error);
    return NextResponse.json({ error: 'Failed to fetch savings plan' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = validateItem(await request.json());
    if (!item) {
      return NextResponse.json({ error: 'A source and positive amount are required' }, { status: 400 });
    }

    const result = await addSavingsPlanItem(item);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error adding savings plan item:', error);
    return NextResponse.json({ error: 'Failed to add savings plan item' }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = Number(body.id);
    const item = validateItem(body);
    if (!Number.isInteger(id) || id <= 0 || !item) {
      return NextResponse.json({ error: 'A valid item is required' }, { status: 400 });
    }

    await updateSavingsPlanItem(id, item);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating savings plan item:', error);
    return NextResponse.json({ error: 'Failed to update savings plan item' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'A valid item id is required' }, { status: 400 });
    }

    await deleteSavingsPlanItem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting savings plan item:', error);
    return NextResponse.json({ error: 'Failed to delete savings plan item' }, { status: 500 });
  }
}
