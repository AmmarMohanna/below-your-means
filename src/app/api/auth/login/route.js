import { NextResponse } from 'next/server';
import { verifyPassword, createSessionValue, getSessionCookieConfig } from '@/lib/auth';

export async function POST(request) {
  try {
    const { password } = await request.json();
    
    if (!verifyPassword(password)) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    const sessionValue = createSessionValue();
    const cookieConfig = getSessionCookieConfig(sessionValue);
    
    const response = NextResponse.json({ success: true });
    response.cookies.set(cookieConfig);
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

