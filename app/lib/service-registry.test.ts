import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeConfig, invalidateConfigCache, type OkfConfig } from '../../lib/config';

let cfgDir: string;
let bundleA: string;
let bundleB: string;

beforeAll(() => {
  cfgDir = mkdtempSync(join(tmpdir(), 'okf-reg-cfg-'));
  bundleA = mkdtempSync(join(tmpdir(), 'okf-reg-a-'));
  bundleB = mkdtempSync(join(tmpdir(), 'okf-reg-b-'));
  writeFileSync(join(bundleA, 'a.md'), '---\ntype: index\ntitle: Alpha\n---\nA\n');
  writeFileSync(join(bundleB, 'b.md'), '---\ntype: index\ntitle: Beta\n---\nB\n');
  process.env.OKF_CONFIG_DIR = cfgDir;
  delete process.env.OKF_BUNDLE_DIR;
  invalidateConfigCache();
  const cfg: OkfConfig = {
    version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
    setupComplete: true, defaultWorkspace: 'a',
    workspaces: [
      { slug: 'a', name: 'A', bundle: { source: 'local', path: bundleA }, ingestTokenHash: 'a'.repeat(64), createdAt: '2026-07-06T00:00:00Z' },
      { slug: 'b', name: 'B', bundle: { source: 'local', path: bundleB }, ingestTokenHash: 'b'.repeat(64), createdAt: '2026-07-06T00:00:00Z' },
    ],
    createdAt: '2026-07-06T00:00:00Z',
  };
  writeConfig(cfg);
});
afterAll(async () => {
  const { resetService } = await import('./service');
  resetService();
  rmSync(cfgDir, { recursive: true, force: true });
  rmSync(bundleA, { recursive: true, force: true });
  rmSync(bundleB, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  invalidateConfigCache();
});

describe('per-workspace service registry', () => {
  it('serves each workspace its own bundle; default = default workspace', async () => {
    const { getService, resetService } = await import('./service');
    resetService();
    expect((await getService()).concept('a.md')?.title).toBe('Alpha');   // default → a
    expect((await getService('b')).concept('b.md')?.title).toBe('Beta'); // explicit b
    expect((await getService('b')).concept('a.md')).toBeUndefined();     // isolation
  });

  it('resetService(slug) resets only that workspace', async () => {
    const { getService, resetService } = await import('./service');
    resetService();
    const pa = getService('a');
    const pb = getService('b');
    await pa; await pb;
    resetService('a');
    expect(getService('b')).toBe(pb);      // b untouched
    expect(getService('a')).not.toBe(pa);  // a rebuilt
    expect((await getService('a')).concept('a.md')?.title).toBe('Alpha');
  });
});
