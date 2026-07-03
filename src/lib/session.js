const SESSION_MESSAGE_PREFIX = 'authenticated:';

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(left = '', right = '') {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

async function digestHex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(signature);
}

export async function verifySecretValue(candidate, expected) {
  if (!expected) return false;

  const [candidateDigest, expectedDigest] = await Promise.all([
    digestHex(candidate || ''),
    digestHex(expected),
  ]);

  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function createSessionValue() {
  const secret = process.env.SESSION_SECRET || 'default-session-secret';
  const password = process.env.APP_PASSWORD || '';
  return hmacHex(secret, `${SESSION_MESSAGE_PREFIX}${password}`);
}

export async function verifySessionValue(sessionValue) {
  if (!sessionValue) return false;
  const expectedValue = await createSessionValue();
  return timingSafeEqual(sessionValue, expectedValue);
}
