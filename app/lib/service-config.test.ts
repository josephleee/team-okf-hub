import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeConfig, invalidateConfigCache, type OkfConfig } from '../../lib/config';

let bundleDir: string;
let cfgDir: string;

beforeAll(() => {
  cfgDir = mkdtempSync(join(tmpdir(), 'okf-svc-cfg-'));
  bundleDir = mkdtempSync(join(tmpdir(), 'okf-svc-bundle-'));
  writeFileSync(join(bundleDir, 'only.md'), '---\ntype: index\ntitle: Only\n---\nfrom config bundle\n');
  process.env.OKF_CONFIG_DIR = cfgDir;
  delete process.env.OKF_BUNDLE_DIR;
  invalidateConfigCache();
  const cfg: OkfConfig = {
    version: 1, workspaceName: 'W', bundle: { source: 'local', path: bundleDir },
    ingestTokenHash: 'a'.repeat(64), adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
    setupComplete: true, createdAt: '2026-07-01T00:00:00Z',
  };
  writeConfig(cfg);
});
afterAll(() => {
  rmSync(cfgDir, { recursive: true, force: true });
  rmSync(bundleDir, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  invalidateConfigCache();
});

describe('service reads the config bundle when OKF_BUNDLE_DIR is unset', () => {
  it('serves the config-pointed bundle', async () => {
    const { getService, resetService } = await import('./service');
    resetService();
    const svc = await getService();
    expect(svc.concept('only.md')?.title).toBe('Only');
  });
});
