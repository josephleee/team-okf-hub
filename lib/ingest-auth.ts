import { getWorkspace } from './config';
import { verifyToken } from './secrets';

export type AuthResult = { ok: true } | { ok: false; status: number; message: string };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(header: string | null): string | null {
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function checkIngestAuth(header: string | null, slug?: string): AuthResult {
  const token = bearer(header);
  const envToken = process.env.OKF_INGEST_TOKEN;
  if (envToken) {
    return token && safeEqual(token, envToken)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  const ws = getWorkspace(slug);
  if (ws?.ingestTokenHash) {
    return token && verifyToken(token, ws.ingestTokenHash)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: false, status: 503, message: 'ingestion not configured; run /setup or set OKF_INGEST_TOKEN' };
}
