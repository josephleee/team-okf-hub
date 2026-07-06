import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BundleConfig {
  source: 'example' | 'local' | 'git';
  path: string;
  gitUrl?: string;
}

export interface WorkspaceConfig {
  slug: string;
  name: string;
  bundle: BundleConfig;
  ingestTokenHash: string;
  createdAt: string;
}

export interface OkfConfig {
  version: 2;
  adminPasswordHash: string;
  sessionSecret: string;
  setupComplete: boolean;
  defaultWorkspace: string;
  workspaces: WorkspaceConfig[];
  createdAt: string;
}

interface OkfConfigV1 {
  version: 1;
  workspaceName: string;
  bundle: BundleConfig;
  ingestTokenHash: string;
  adminPasswordHash: string;
  sessionSecret: string;
  setupComplete: boolean;
  createdAt: string;
}

export function configDir(): string {
  return process.env.OKF_CONFIG_DIR ?? '.okf-hub';
}

function configPath(): string {
  return join(configDir(), 'config.json');
}

export function workspaceSlug(name: string, taken: string[]): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'workspace';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function migrateV1(v1: OkfConfigV1): OkfConfig {
  const slug = workspaceSlug(v1.workspaceName, []);
  return {
    version: 2,
    adminPasswordHash: v1.adminPasswordHash,
    sessionSecret: v1.sessionSecret,
    setupComplete: v1.setupComplete,
    defaultWorkspace: slug,
    workspaces: [{
      slug,
      name: v1.workspaceName,
      bundle: v1.bundle,
      ingestTokenHash: v1.ingestTokenHash,
      createdAt: v1.createdAt,
    }],
    createdAt: v1.createdAt,
  };
}

let cache: OkfConfig | null | undefined;

export function invalidateConfigCache(): void {
  cache = undefined;
}

export function readConfig(): OkfConfig | null {
  if (cache !== undefined) return cache;
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8')) as { version?: number };
    if (parsed.version === 1) {
      const migrated = migrateV1(parsed as unknown as OkfConfigV1);
      try {
        writeConfig(migrated); // persist the migration once; sets cache
      } catch {
        cache = migrated; // persist failed (e.g. read-only fs) — stay configured in memory
      }
    } else {
      cache = parsed as unknown as OkfConfig;
    }
  } catch {
    cache = null;
  }
  return cache ?? null;
}

export function writeConfig(config: OkfConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
  cache = config;
}

export function defaultWorkspaceSlug(): string | null {
  return readConfig()?.defaultWorkspace ?? null;
}

export function getWorkspace(slug?: string): WorkspaceConfig | null {
  const cfg = readConfig();
  if (!cfg) return null;
  const target = slug ?? cfg.defaultWorkspace;
  return cfg.workspaces.find((w) => w.slug === target) ?? null;
}

export function resolveBundleDir(slug?: string): string {
  const cfg = readConfig();
  // OKF_BUNDLE_DIR only ever meant "the bundle this hub serves" — that is the default workspace.
  const isDefault = !slug || slug === cfg?.defaultWorkspace;
  if (isDefault && process.env.OKF_BUNDLE_DIR) return process.env.OKF_BUNDLE_DIR;
  const ws = getWorkspace(slug);
  if (ws?.bundle?.path) return ws.bundle.path;
  return 'bundles/example';
}

export function setupState(): 'env-configured' | 'file-configured' | 'first-run' {
  if (process.env.OKF_INGEST_TOKEN) return 'env-configured';
  if (readConfig()?.setupComplete) return 'file-configured';
  return 'first-run';
}
