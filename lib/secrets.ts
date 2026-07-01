import { randomBytes, createHash, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyToken(input: string, storedHash: string): boolean {
  if (!input || !storedHash) return false;
  return safeEqualHex(hashToken(input), storedHash);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(input: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1]!;
  const expected = parts[2]!;
  const actual = scryptSync(input, salt, 32).toString('hex');
  return safeEqualHex(actual, expected);
}

export function randomSecret(): string {
  return randomBytes(32).toString('hex');
}

export function signSession(expMs: number, secret: string): string {
  const payload = String(expMs);
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

export function verifySession(cookie: string | undefined, secret: string, nowMs: number): boolean {
  if (!cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (!safeEqualHex(mac, expected)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > nowMs;
}
