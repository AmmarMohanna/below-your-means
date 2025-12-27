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

// Get the valid session token (stored in env or generated once)
function getValidSessionToken() {
  // In production, we use the session token from the cookie and verify it
  // For simplicity, we'll just check if a session cookie exists
  return process.env.SESSION_SECRET || 'default-session-secret';
}

// Create session cookie value (HMAC of session secret)
export function createSessionValue() {
  const secret = getValidSessionToken();
  return crypto.createHmac('sha256', secret).update('authenticated').digest('hex');
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

// Get session cookie config
export function getSessionCookieConfig(value) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  };
}

