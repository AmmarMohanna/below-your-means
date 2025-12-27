import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Verify session value matches current password
// When password changes, old sessions become invalid
function isValidSession(sessionValue) {
  if (!sessionValue) return false;
  
  const secret = process.env.SESSION_SECRET || 'default-session-secret';
  const password = process.env.APP_PASSWORD || '';
  const expectedValue = crypto.createHmac('sha256', secret).update('authenticated:' + password).digest('hex');
  
  return sessionValue === expectedValue;
}

export function middleware(request) {
  const sessionCookie = request.cookies.get('bym_session');
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const publicPaths = ['/login', '/api/auth/login', '/api/auth/check'];
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  // Static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check if session is VALID (not just exists)
  const hasValidSession = isValidSession(sessionCookie?.value);

  // If on login page and has valid session, redirect to dashboard
  if (pathname === '/login' && hasValidSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If not authenticated and not on public path, redirect to login
  if (!hasValidSession && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)',
  ],
};
