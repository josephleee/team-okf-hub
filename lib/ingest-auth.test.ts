import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkIngestAuth } from './ingest-auth';
import { writeConfig, invalidateConfigCache, type OkfConfig } from './config';
import { generateToken, hashToken } from './secrets';

const origToken = process.env.OKF_INGEST_TOKEN;
const origCfg = process.env.OKF_CONFIG_DIR;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-auth-'));
  process.env.OKF_CONFIG_DIR = dir;
  delete process.env.OKF_INGEST_TOKEN;
  invalidateConfigCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origToken === undefined) delete process.env.OKF_INGEST_TOKEN; else process.env.OKF_INGEST_TOKEN = origToken;
  if (origCfg === undefined) delete process.env.OKF_CONFIG_DIR; else process.env.OKF_CONFIG_DIR = origCfg;
  invalidateConfigCache();
});

const cfgWith = (tokenHash: string): OkfConfig => ({
  version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
  setupComplete: true, defaultWorkspace: 'w',
  workspaces: [{ slug: 'w', name: 'W', bundle: { source: 'example', path: 'bundles/example' }, ingestTokenHash: tokenHash, createdAt: '2026-07-06T00:00:00Z' }],
  createdAt: '2026-07-06T00:00:00Z',
});

describe('checkIngestAuth', () => {
  it('503 when neither env token nor config is present', () => {
    const result = checkIngestAuth('Bearer x');
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(503);
  });
  it('env token: raw compare (backward compatible)', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer s3cret')).toEqual({ ok: true });
    expect((checkIngestAuth('Bearer nope') as { status: number }).status).toBe(401);
    expect((checkIngestAuth(null) as { status: number }).status).toBe(401);
  });
  it('config hash: verifies a token against the stored sha256', () => {
    const token = generateToken();
    writeConfig(cfgWith(hashToken(token)));
    expect(checkIngestAuth(`Bearer ${token}`)).toEqual({ ok: true });
    expect((checkIngestAuth('Bearer wrong') as { status: number }).status).toBe(401);
  });
  it('env token wins over config hash', () => {
    process.env.OKF_INGEST_TOKEN = 'envwins';
    writeConfig(cfgWith(hashToken('other')));
    expect(checkIngestAuth('Bearer envwins')).toEqual({ ok: true });
  });
});
