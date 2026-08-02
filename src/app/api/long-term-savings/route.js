import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import { updateLongTermSavings } from '@/lib/db';

export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { aub_pension_amount } = await request.json();
    const amount = Number(aub_pension_amount);

    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'A valid pension amount is required' }, { status: 400 });
    }

    await updateLongTermSavings({ aub_pension_amount: amount });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating savings:', error);
    return NextResponse.json({ error: 'Failed to update savings' }, { status: 500 });
  }
}
