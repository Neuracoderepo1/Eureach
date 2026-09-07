import crypto from 'node:crypto';

const b64u = value => Buffer.from(value).toString('base64url');
const fromB64u = value => Buffer.from(value, 'base64url');

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Password must be at least 12 characters');
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [, saltRaw, hashRaw] = String(encoded).split('$');
    const expected = fromB64u(hashRaw);
    const actual = crypto.scryptSync(password, fromB64u(saltRaw), expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function hmac(input, secret) { return crypto.createHmac('sha256', secret).update(input).digest('base64url'); }

export function signJwt(payload, secret, ttlSeconds = 900) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const encoded = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(body))}`;
  return `${encoded}.${hmac(encoded, secret)}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [head, body, sig] = parts;
  const expected = hmac(`${head}.${body}`, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid token signature');
  const header = JSON.parse(fromB64u(head));
  if (header.alg !== 'HS256') throw new Error('Unsupported token algorithm');
  const claims = JSON.parse(fromB64u(body));
  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return claims;
}

export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
export function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
export function uuid() { return crypto.randomUUID(); }
