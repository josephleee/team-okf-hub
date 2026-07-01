import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig, writeConfig, resolveBundleDir, setupState, invalidateConfigCache, type OkfConfig } from './config';

let dir: string;
const envToken = process.env.OKF_INGEST_TOKEN;
const envBundle = process.env.OKF_BUNDLE_DIR;

const sample = (over: Partial<OkfConfig> = {}): OkfConfig => ({
  version: 1, workspaceName: 'Test', bundle: { source: 'local', path: '/tmp/b' },
  ingestTokenHash: 'a'.repeat(64), adminPasswordHash: 'scrypt$aa$bb', sessionSecret: 'c'.repeat(64),
  setupComplete: true, createdAt: '2026-07-01T00:00:00Z', ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-cfg-'));
  process.env.OKF_CONFIG_DIR = dir;
  delete process.env.OKF_INGEST_TOKEN;
  delete process.env.OKF_BUNDLE_DIR;
  invalidateConfigCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  if (envToken === undefined) delete process.env.OKF_INGEST_TOKEN; else process.env.OKF_INGEST_TOKEN = envToken;
  if (envBundle === undefined) delete process.env.OKF_BUNDLE_DIR; else process.env.OKF_BUNDLE_DIR = envBundle;
  invalidateConfigCache();
});

describe('config store', () => {
  it('reads null before any write', () => {
    expect(readConfig()).toBeNull();
    expect(setupState()).toBe('first-run');
  });
  it('writes then reads back, file mode 0600', () => {
    writeConfig(sample());
    const c = readConfig();
    expect(c?.workspaceName).toBe('Test');
    const mode = statSync(join(dir, 'config.json')).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(setupState()).toBe('file-configured');
  });
  it('resolveBundleDir precedence: env > file > default', () => {
    expect(resolveBundleDir()).toBe('bundles/example'); // default
    writeConfig(sample({ bundle: { source: 'local', path: '/from/file' } }));
    expect(resolveBundleDir()).toBe('/from/file'); // file
    process.env.OKF_BUNDLE_DIR = '/from/env';
    expect(resolveBundleDir()).toBe('/from/env'); // env wins
  });
  it('env token makes setupState env-configured', () => {
    process.env.OKF_INGEST_TOKEN = 'x';
    expect(setupState()).toBe('env-configured');
  });
});
