import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig, invalidateConfigCache, getWorkspace } from '../../lib/config';
import { verifyToken } from '../../lib/secrets';
import { isAdmin } from './admin-session';

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
    expect(cfg.version).toBe(2);
    expect(cfg.setupComplete).toBe(true);
    const ws = cfg.workspaces[0]!;
    expect(ws.name).toBe('Acme');
    expect(ws.slug).toBe('acme');
    expect(cfg.defaultWorkspace).toBe('acme');
    expect(ws.bundle).toEqual({ source: 'example', path: 'bundles/example' });
    expect(verifyToken(res.token, ws.ingestTokenHash)).toBe(true); // token matches stored hash
    expect(cfg.adminPasswordHash.startsWith('scrypt$')).toBe(true);
    expect(res.mcpCommand).toContain('/w/acme/api/mcp');
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

describe('workspace management (admin)', () => {
  beforeEach(async () => {
    const { completeSetup } = await import('./setup-actions');
    await completeSetup({ workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough' });
    vi.mocked(isAdmin).mockResolvedValue(true);
  });
  afterEach(() => {
    vi.mocked(isAdmin).mockResolvedValue(false);
  });

  it('addWorkspace creates a second workspace with a unique slug and working token', async () => {
    const { addWorkspace } = await import('./setup-actions');
    const res = await addWorkspace({ name: 'Acme', bundleSource: 'example' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.slug).toBe('acme-2'); // 'acme' is taken by the first workspace
    expect(res.mcpCommand).toContain('/w/acme-2/api/mcp');
    const cfg = readConfig()!;
    expect(cfg.workspaces.length).toBe(2);
    expect(verifyToken(res.token, cfg.workspaces[1]!.ingestTokenHash)).toBe(true);
    expect(cfg.defaultWorkspace).toBe('acme'); // adding does not change the default
  });

  it('addWorkspace is refused without an admin session', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const { addWorkspace } = await import('./setup-actions');
    expect((await addWorkspace({ name: 'X', bundleSource: 'example' })).ok).toBe(false);
  });

  it('rotateToken(slug) rotates only that workspace', async () => {
    const { addWorkspace, rotateToken } = await import('./setup-actions');
    await addWorkspace({ name: 'Labs', bundleSource: 'example' });
    const before = readConfig()!;
    const hashAcme = before.workspaces[0]!.ingestTokenHash;
    const res = await rotateToken('labs');
    expect(res.ok).toBe(true);
    const after = readConfig()!;
    expect(after.workspaces[0]!.ingestTokenHash).toBe(hashAcme); // untouched
    expect(verifyToken(res.token!, after.workspaces[1]!.ingestTokenHash)).toBe(true);
  });

  it('renameWorkspace changes name, never slug', async () => {
    const { renameWorkspace } = await import('./setup-actions');
    expect((await renameWorkspace('acme', 'Acme Prod')).ok).toBe(true);
    expect(getWorkspace('acme')?.name).toBe('Acme Prod');
    expect(getWorkspace('acme')?.slug).toBe('acme');
  });

  it('deleteWorkspace: refuses the last one; reassigns default when deleting it', async () => {
    const { addWorkspace, deleteWorkspace } = await import('./setup-actions');
    expect((await deleteWorkspace('acme')).ok).toBe(false); // last workspace
    await addWorkspace({ name: 'Labs', bundleSource: 'example' });
    expect((await deleteWorkspace('acme')).ok).toBe(true); // deleting the default
    const cfg = readConfig()!;
    expect(cfg.workspaces.length).toBe(1);
    expect(cfg.defaultWorkspace).toBe('labs'); // reassigned
  });

  it('setDefaultWorkspace switches the default; unknown slug refused', async () => {
    const { addWorkspace, setDefaultWorkspace } = await import('./setup-actions');
    await addWorkspace({ name: 'Labs', bundleSource: 'example' });
    expect((await setDefaultWorkspace('labs')).ok).toBe(true);
    expect(readConfig()!.defaultWorkspace).toBe('labs');
    expect((await setDefaultWorkspace('nope')).ok).toBe(false);
  });
});

describe('admin gate', () => {
  it('rotateToken is refused without an admin session', async () => {
    const { completeSetup, rotateToken } = await import('./setup-actions');
    await completeSetup({ workspaceName: 'A', bundleSource: 'example', adminPassword: 'longenough' });
    const res = await rotateToken('a'); // isAdmin() mocked to false
    expect(res.ok).toBe(false);
  });
});
