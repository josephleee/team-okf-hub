import { describe, it, expect } from 'vitest';
import { originFromHeaders } from './request-origin';

const H = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

describe('originFromHeaders', () => {
  it('uses x-forwarded-proto and x-forwarded-host', () => {
    expect(originFromHeaders(H({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'hub.example.com' }))).toBe('https://hub.example.com');
  });
  it('falls back to host header, then localhost; default proto is http', () => {
    expect(originFromHeaders(H({ host: 'myhost:3000' }))).toBe('http://myhost:3000');
    expect(originFromHeaders(H({}))).toBe('http://localhost:3000');
  });
  it('takes the first value of comma-chained proto AND host', () => {
    expect(originFromHeaders(H({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'a.example, b.example' }))).toBe('https://a.example');
  });
});
