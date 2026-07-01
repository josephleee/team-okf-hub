import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BundleConfig {
  source: 'example' | 'local' | 'git';
  path: string;
  gitUrl?: string;
}

export interface OkfConfig {
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

let cache: OkfConfig | null | undefined;

export function invalidateConfigCache(): void {
  cache = undefined;
}

export function readConfig(): OkfConfig | null {
  if (cache !== undefined) return cache;
  try {
    const raw = readFileSync(configPath(), 'utf8');
    cache = JSON.parse(raw) as OkfConfig;
  } catch {
    cache = null;
  }
  return cache;
}

export function writeConfig(config: OkfConfig): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
  cache = config;
}

export function resolveBundleDir(): string {
  const env = process.env.OKF_BUNDLE_DIR;
  if (env) return env;
  const cfg = readConfig();
  if (cfg?.bundle?.path) return cfg.bundle.path;
  return 'bundles/example';
}

export function setupState(): 'env-configured' | 'file-configured' | 'first-run' {
  if (process.env.OKF_INGEST_TOKEN) return 'env-configured';
  if (readConfig()?.setupComplete) return 'file-configured';
  return 'first-run';
}
