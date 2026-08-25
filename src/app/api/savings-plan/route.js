import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import {
  getSavingsPlan,
  updateSavingsPlan,
} from '@/lib/db';

function isValidDate(value) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
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

export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const targetAmount = Number(body.target_amount);
    const targetDate = body.target_date ? String(body.target_date) : null;

    if (!Number.isFinite(targetAmount) || targetAmount < 0 || !isValidDate(targetDate)) {
      return NextResponse.json({ error: 'A valid goal and date are required' }, { status: 400 });
    }

    await updateSavingsPlan({ target_amount: targetAmount, target_date: targetDate });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating savings plan:', error);
    return NextResponse.json({ error: 'Failed to update savings plan' }, { status: 500 });
  }
}
