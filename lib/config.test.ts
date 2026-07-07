import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readConfig, writeConfig, resolveBundleDir, setupState, invalidateConfigCache,
  getWorkspace, defaultWorkspaceSlug, workspaceSlug, type OkfConfig,
} from './config';

let dir: string;
const envToken = process.env.OKF_INGEST_TOKEN;
const envBundle = process.env.OKF_BUNDLE_DIR;

const sample = (over: Partial<OkfConfig> = {}): OkfConfig => ({
  version: 2,
  adminPasswordHash: 'scrypt$aa$bb',
  sessionSecret: 'c'.repeat(64),
  setupComplete: true,
  defaultWorkspace: 'main',
  workspaces: [
    { slug: 'main', name: 'Main', bundle: { source: 'local', path: '/tmp/main-bundle' }, ingestTokenHash: 'a'.repeat(64), createdAt: '2026-07-06T00:00:00Z' },
    { slug: 'labs', name: 'Labs', bundle: { source: 'local', path: '/tmp/labs-bundle' }, ingestTokenHash: 'b'.repeat(64), createdAt: '2026-07-06T00:00:00Z' },
  ],
  createdAt: '2026-07-06T00:00:00Z',
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-cfg2-'));
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

describe('config v2 store', () => {
  it('reads null before any write; first-run state', () => {
    expect(readConfig()).toBeNull();
    expect(setupState()).toBe('first-run');
    expect(defaultWorkspaceSlug()).toBeNull();
    expect(getWorkspace()).toBeNull();
  });

  it('writes then reads back v2, file mode 0600', () => {
    writeConfig(sample());
    const c = readConfig();
    expect(c?.version).toBe(2);
    expect(c?.workspaces.length).toBe(2);
    const mode = statSync(join(dir, 'config.json')).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(setupState()).toBe('file-configured');
  });

  it('getWorkspace: by slug, default when omitted, null for unknown', () => {
    writeConfig(sample());
    expect(getWorkspace('labs')?.name).toBe('Labs');
    expect(getWorkspace()?.slug).toBe('main');
    expect(getWorkspace('nope')).toBeNull();
    expect(defaultWorkspaceSlug()).toBe('main');
  });
});

describe('v1 → v2 migration', () => {
  it('migrates a v1 file on read and persists v2 back', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), JSON.stringify({
      version: 1, workspaceName: 'Acme Data', bundle: { source: 'local', path: '/srv/b' },
      ingestTokenHash: 'a'.repeat(64), adminPasswordHash: 'scrypt$x$y', sessionSecret: 'z'.repeat(64),
      setupComplete: true, createdAt: '2026-07-01T00:00:00Z',
    }));
    const c = readConfig();
    expect(c?.version).toBe(2);
    expect(c?.defaultWorkspace).toBe('acme-data');
    expect(c?.workspaces[0]).toEqual({
      slug: 'acme-data', name: 'Acme Data', bundle: { source: 'local', path: '/srv/b' },
      ingestTokenHash: 'a'.repeat(64), createdAt: '2026-07-01T00:00:00Z',
    });
    expect(c?.adminPasswordHash).toBe('scrypt$x$y');
    // persisted back to disk as v2
    const onDisk = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(onDisk.version).toBe(2);
  });

  it('stays configured in memory when the migration cannot be persisted', () => {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'config.json');
    writeFileSync(file, JSON.stringify({
      version: 1, workspaceName: 'Acme Data', bundle: { source: 'local', path: '/srv/b' },
      ingestTokenHash: 'a'.repeat(64), adminPasswordHash: 'scrypt$x$y', sessionSecret: 'z'.repeat(64),
      setupComplete: true, createdAt: '2026-07-01T00:00:00Z',
    }));
    chmodSync(file, 0o400); // owner read-only → writeConfig throws
    try {
      const c = readConfig();
      expect(c?.version).toBe(2);
      expect(c?.workspaces[0]?.slug).toBe('acme-data');
      expect(setupState()).toBe('file-configured'); // NOT first-run
    } finally {
      chmodSync(file, 0o600);
    }
  });
});

describe('workspaceSlug', () => {
  it('slugifies and uniquifies', () => {
    expect(workspaceSlug('Acme Data', [])).toBe('acme-data');
    expect(workspaceSlug('Acme Data', ['acme-data'])).toBe('acme-data-2');
    expect(workspaceSlug('Acme Data', ['acme-data', 'acme-data-2'])).toBe('acme-data-3');
    expect(workspaceSlug('***', [])).toBe('workspace');
  });
});

describe('resolveBundleDir(slug?)', () => {
  it('default: env > file > fallback', () => {
    expect(resolveBundleDir()).toBe('bundles/example'); // nothing
    writeConfig(sample());
    expect(resolveBundleDir()).toBe('/tmp/main-bundle'); // file (default ws)
    process.env.OKF_BUNDLE_DIR = '/from/env';
    expect(resolveBundleDir()).toBe('/from/env'); // env wins for default
    expect(resolveBundleDir('main')).toBe('/from/env'); // explicit default slug: env still wins
  });
  it('env does NOT override a non-default workspace', () => {
    writeConfig(sample());
    process.env.OKF_BUNDLE_DIR = '/from/env';
    expect(resolveBundleDir('labs')).toBe('/tmp/labs-bundle');
  });
  it('env token makes setupState env-configured', () => {
    process.env.OKF_INGEST_TOKEN = 'x';
    expect(setupState()).toBe('env-configured');
  });
});
