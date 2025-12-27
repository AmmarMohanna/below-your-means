import { NextResponse } from 'next/server';
import { getClearSessionCookieConfig } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  const cookieConfig = getClearSessionCookieConfig();
  response.cookies.set(cookieConfig);
  return response;
}

