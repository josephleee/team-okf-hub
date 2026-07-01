export type AuthResult = { ok: true } | { ok: false; status: number; message: string };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkIngestAuth(header: string | null): AuthResult {
  const token = process.env.OKF_INGEST_TOKEN;
  if (!token) {
    return { ok: false, status: 503, message: 'ingestion not configured; set OKF_INGEST_TOKEN' };
  }
  const expected = `Bearer ${token}`;
  if (!header || !safeEqual(header, expected)) {
    return { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: true };
}
