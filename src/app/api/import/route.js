import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import { importWorkbookBuffer } from '@/lib/workbook-import';

export const runtime = 'nodejs';

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const summary = await importWorkbookBuffer(Buffer.from(arrayBuffer));
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('Error importing workbook:', error);
    return NextResponse.json({ error: 'Failed to import workbook' }, { status: 500 });
  }
}
