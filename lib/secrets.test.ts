import { describe, it, expect } from 'vitest';
import {
  generateToken, hashToken, verifyToken,
  hashPassword, verifyPassword, randomSecret,
  signSession, verifySession,
} from './secrets';

describe('token', () => {
  it('generates distinct tokens and verifies by hash', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThan(20);
    const h = hashToken(t1);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyToken(t1, h)).toBe(true);
    expect(verifyToken(t2, h)).toBe(false);
    expect(verifyToken('', h)).toBe(false);
  });
});

describe('password', () => {
  it('hashes with scrypt and verifies', () => {
    const stored = hashPassword('correct horse');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });
  it('produces a different salt each time', () => {
    expect(hashPassword('x')).not.toBe(hashPassword('x'));
  });
});

describe('session', () => {
  const secret = randomSecret();
  it('signs and verifies within TTL', () => {
    const cookie = signSession(1000, secret);
    expect(verifySession(cookie, secret, 500)).toBe(true);
  });
  it('rejects expired, tampered, wrong-secret, and missing', () => {
    const cookie = signSession(1000, secret);
    expect(verifySession(cookie, secret, 1001)).toBe(false); // expired
    expect(verifySession(cookie + 'x', secret, 500)).toBe(false); // tampered
    expect(verifySession(cookie, randomSecret(), 500)).toBe(false); // wrong secret
    expect(verifySession(undefined, secret, 500)).toBe(false);
    expect(verifySession('garbage', secret, 500)).toBe(false);
  });
});
