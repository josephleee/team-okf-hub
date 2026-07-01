import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig, invalidateConfigCache } from '../../lib/config';
import { verifyToken } from '../../lib/secrets';

vi.mock('./service', () => ({ resetService: () => {} }));
vi.mock('./admin-session', () => ({
  isAdmin: vi.fn(async () => false),
  setAdminSession: vi.fn(async () => {}),
  clearAdminSession: vi.fn(async () => {}),
}));

let dir: string;
const origToken = process.env.OKF_INGEST_TOKEN;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-setup-'));
  process.env.OKF_CONFIG_DIR = dir;
  delete process.env.OKF_INGEST_TOKEN;
  invalidateConfigCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  if (origToken !== undefined) process.env.OKF_INGEST_TOKEN = origToken;
  invalidateConfigCache();
});

describe('completeSetup', () => {
  it('writes config, hashes secrets, returns a working token once', async () => {
    const { completeSetup } = await import('./setup-actions');
    const res = await completeSetup({
      workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cfg = readConfig()!;
    expect(cfg.setupComplete).toBe(true);
    expect(cfg.workspaceName).toBe('Acme');
    expect(cfg.bundle).toEqual({ source: 'example', path: 'bundles/example' });
    expect(verifyToken(res.token, cfg.ingestTokenHash)).toBe(true); // token matches stored hash
    expect(cfg.adminPasswordHash.startsWith('scrypt$')).toBe(true);
    expect(res.mcpCommand).toContain('/api/mcp');
  });

  it('rejects a short admin password and does not write config', async () => {
    const { completeSetup } = await import('./setup-actions');
    const res = await completeSetup({ workspaceName: 'A', bundleSource: 'example', adminPassword: 'short' });
    expect(res.ok).toBe(false);
    expect(readConfig()).toBeNull();
  });

  it('refuses to run again once setup is complete', async () => {
    const { completeSetup } = await import('./setup-actions');
    await completeSetup({ workspaceName: 'A', bundleSource: 'example', adminPassword: 'longenough' });
    const again = await completeSetup({ workspaceName: 'B', bundleSource: 'example', adminPassword: 'longenough' });
    expect(again.ok).toBe(false);
  });
});

describe('admin gate', () => {
  it('rotateToken is refused without an admin session', async () => {
    const { completeSetup, rotateToken } = await import('./setup-actions');
    await completeSetup({ workspaceName: 'A', bundleSource: 'example', adminPassword: 'longenough' });
    const res = await rotateToken(); // isAdmin() mocked to false
    expect(res.ok).toBe(false);
  });
});
