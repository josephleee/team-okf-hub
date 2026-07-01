import { describe, it, expect, afterEach } from 'vitest';
import { checkIngestAuth } from './ingest-auth';

const original = process.env.OKF_INGEST_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.OKF_INGEST_TOKEN;
  else process.env.OKF_INGEST_TOKEN = original;
});

describe('checkIngestAuth', () => {
  it('returns 503 when the token env is unset', () => {
    delete process.env.OKF_INGEST_TOKEN;
    expect(checkIngestAuth('Bearer whatever')).toEqual({
      ok: false, status: 503, message: 'ingestion not configured; set OKF_INGEST_TOKEN',
    });
  });

  it('returns ok for the correct bearer token', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer s3cret')).toEqual({ ok: true });
  });

  it('returns 401 for a wrong or missing token', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer nope').ok).toBe(false);
    expect((checkIngestAuth('Bearer nope') as { status: number }).status).toBe(401);
    expect((checkIngestAuth(null) as { status: number }).status).toBe(401);
  });
});
