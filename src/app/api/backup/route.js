import fs from 'fs';
import os from 'os';
import path from 'path';

import { NextResponse } from 'next/server';

import { isAuthenticated } from '@/lib/auth';
import { createDatabaseSnapshot } from '@/lib/db';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let snapshotPath = '';

  try {
    const fileName = `belowyourmeans-backup-${new Date().toISOString().slice(0, 10)}.db`;
    snapshotPath = path.join(os.tmpdir(), fileName);
    createDatabaseSnapshot(snapshotPath);

    const fileBuffer = fs.readFileSync(snapshotPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  } finally {
    if (snapshotPath && fs.existsSync(snapshotPath)) {
      fs.rmSync(snapshotPath);
    }
  }
}
