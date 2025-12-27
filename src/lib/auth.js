import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'bym_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Simple password check - no user management, just a single password
export function verifyPassword(password) {
  const correctPassword = process.env.APP_PASSWORD;
  if (!correctPassword) {
    console.warn('WARNING: APP_PASSWORD not set in environment variables!');
    return false;
  }
  return password === correctPassword;
}

// Create session cookie value (HMAC of secret + password)
// When password changes, all sessions become invalid
export function createSessionValue() {
  const secret = process.env.SESSION_SECRET || 'default-session-secret';
  const password = process.env.APP_PASSWORD || '';
  // Include password in hash so changing password invalidates all sessions
  return crypto.createHmac('sha256', secret).update('authenticated:' + password).digest('hex');
}

// Verify session cookie
function verifySession(sessionValue) {
  const expectedValue = createSessionValue();
  return sessionValue === expectedValue;
}

// Check if request is authenticated (for API routes)
export async function isAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);
  if (!session) return false;
  return verifySession(session.value);
}

// Check if secure cookies should be used
// Set SECURE_COOKIES=false in .env if using HTTP (no HTTPS)
function useSecureCookies() {
  if (process.env.SECURE_COOKIES === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

// Get session cookie config
export function getSessionCookieConfig(value) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  };
}

// Clear session cookie config
export function getClearSessionCookieConfig() {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  };
}

