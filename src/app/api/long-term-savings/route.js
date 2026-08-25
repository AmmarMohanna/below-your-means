import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import { updateLongTermSavings } from '@/lib/db';

export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const amounts = {};

    for (const field of ['aub_pension_amount', 'cash_savings_amount']) {
      if (body[field] === undefined) continue;

      const amount = Number(body[field]);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: 'A valid savings amount is required' }, { status: 400 });
      }
      amounts[field] = amount;
    }

    if (Object.keys(amounts).length === 0) {
      return NextResponse.json({ error: 'A savings amount is required' }, { status: 400 });
    }

    await updateLongTermSavings(amounts);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating savings:', error);
    return NextResponse.json({ error: 'Failed to update savings' }, { status: 500 });
  }
}
