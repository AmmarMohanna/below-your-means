import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import { getRecentAuditEntries, undoAuditEntry } from '@/lib/db';

export async function GET(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get('limit') || 20);
    const entries = await getRecentAuditEntries(limit);
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { auditId } = await request.json();
    if (!auditId) {
      return NextResponse.json({ error: 'Missing auditId' }, { status: 400 });
    }

    await undoAuditEntry(Number(auditId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error undoing history item:', error);
    return NextResponse.json({ error: 'Failed to undo change' }, { status: 500 });
  }
}
