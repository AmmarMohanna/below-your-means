import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { deleteTransaction } from '@/lib/db';

export async function DELETE(request, { params }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    deleteTransaction(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

