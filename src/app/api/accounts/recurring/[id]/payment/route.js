import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { markRecurringPaid } from '@/lib/db';

async function setPaymentState({ params }, paid) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid payment id' }, { status: 400 });
  }
  try {
    const item = await markRecurringPaid(id, paid);
    if (!item) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
    return NextResponse.json({ item });
  } catch (error) {
    console.error('Error recording recurring payment:', error);
    return NextResponse.json({ error: 'Could not save payment. Please try again.' }, { status: 500 });
  }
}

export async function POST(request, context) {
  return setPaymentState(context, true);
}

export async function DELETE(request, context) {
  return setPaymentState(context, false);
}
