# Multi-Workspace Core (M5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One hub serves multiple independent workspaces — config v2 + migration, per-workspace service registry and ingest auth, `/w/<slug>/api/*` REST + MCP endpoints, and hub-admin workspace management (add / rename / change bundle / rotate token / delete / set default). Browser pages stay on the default workspace (that is M5b).

**Architecture:** `lib/config.ts` becomes a v2 store (hub fields + `workspaces[]`), migrating v1 files on first read. `app/lib/service.ts` becomes a slug-keyed registry. `checkIngestAuth` gains a `slug` param (env token still wins, hub-wide). REST logic moves into shared handlers (`app/lib/api-handlers.ts`) used by both legacy routes (default workspace) and new `/w/[ws]/api/v1/*` routes. The MCP handler moves into a memoized per-basePath factory (`app/lib/mcp.ts`) so each workspace gets its own mount. Setup server actions gain workspace management; the settings UI lists workspaces with per-workspace controls.

**Tech Stack:** Next.js 15 (App Router, Server Actions, async `params`), TypeScript ESM, `mcp-handler` + `zod` (already installed), node:crypto via existing `lib/secrets.ts`, Vitest (+ jsdom for components). **No new dependencies.**

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-okf-hub-multi-workspace-design.md`.
- **Branch:** create `feat/m5-workspaces` off `feat/m4a-web-setup` (Task 1 Step 0). Commit trailer on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Config file:** unchanged location `${OKF_CONFIG_DIR ?? '.okf-hub'}/config.json`, dir mode `0700`, file mode `0600`.
- **Env precedence (verbatim rules):** `OKF_INGEST_TOKEN` (raw compare) is valid on **every** workspace endpoint — env wins. `OKF_BUNDLE_DIR` overrides the bundle dir of the **default workspace only** (and applies when no config exists). Fallback bundle dir: `'bundles/example'`.
- **Slugs:** charset `[a-z0-9-]`, max 40 chars, fallback `'workspace'`, uniqueness via `-2`, `-3`, … suffix. **Slugs are permanent** — rename changes `name` only.
- **Legacy URLs** (`/`, `/api/v1/*`, `/api/mcp`) serve the **default workspace**, unchanged behavior. `/setup` stays hub-level. Unknown slug → pages `notFound()`, APIs 404 JSON `{ error: 'unknown workspace' }`.
- **Isolation:** workspace A's token on workspace B's endpoint → **401**.
- **Backward compatibility:** all existing tests keep passing. Where the v2 schema forces a test-file update, the behavioral assertions stay the same.
- **MCP runtime risk (M3 lesson):** `createMcpHandler`'s `basePath` is static per instance — per-workspace handlers must be memoized per basePath, and `next build` passing does NOT prove the mount works. The Task 8 runtime smoke is mandatory before merge.
- **No new runtime dependencies.** ESM imports without file extensions; `strict` + `noUncheckedIndexedAccess`.
- **Test commands:** `npx vitest run <file>` (targeted), `npm test` (all), `npm run typecheck`, `npm run build`.

---

### Task 1: Config v2 + migration (and mechanical consumer updates)

The schema change compiles only if every consumer of the old v1 fields is updated in the same task. External behavior is **identical** after this task (single workspace, same signatures).

**Files:**
- Modify: `lib/config.ts` (v2 store), `lib/ingest-auth.ts` (one lookup swap), `app/lib/setup-actions.ts` (v2 shapes, same signatures), `app/setup/page.tsx` (display fields)
- Test: `lib/config.test.ts` (replace), `lib/ingest-auth.test.ts` (v2 fixtures), `app/lib/service-config.test.ts` (v2 fixture), `app/lib/setup-actions.test.ts` (v2 assertions)

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `interface WorkspaceConfig { slug: string; name: string; bundle: BundleConfig; ingestTokenHash: string; createdAt: string }`
  - `interface OkfConfig { version: 2; adminPasswordHash: string; sessionSecret: string; setupComplete: boolean; defaultWorkspace: string; workspaces: WorkspaceConfig[]; createdAt: string }`
  - `workspaceSlug(name: string, taken: string[]): string`
  - `getWorkspace(slug?: string): WorkspaceConfig | null` (omitted slug → default workspace)
  - `defaultWorkspaceSlug(): string | null`
  - `resolveBundleDir(slug?: string): string`
  - `readConfig(): OkfConfig | null` (migrates v1 on disk → v2, persists once), `writeConfig`, `invalidateConfigCache`, `configDir`, `setupState` unchanged names.

- [ ] **Step 0: Create the branch**

```bash
git checkout -b feat/m5-workspaces
```

- [ ] **Step 1: Write the failing test**

Replace `lib/config.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — `getWorkspace`, `workspaceSlug`, `defaultWorkspaceSlug` not exported; v2 shape unknown.

- [ ] **Step 3: Rewrite `lib/config.ts`**

```ts
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
      writeConfig(migrateV1(parsed as unknown as OkfConfigV1)); // persist the migration once; sets cache
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
```

- [ ] **Step 4: Mechanical consumer update — `lib/ingest-auth.ts`**

Change the import and the config-hash block (behavior identical: it now reads the default workspace's hash):

```ts
import { getWorkspace } from './config';
import { verifyToken } from './secrets';

export type AuthResult = { ok: true } | { ok: false; status: number; message: string };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(header: string | null): string | null {
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function checkIngestAuth(header: string | null): AuthResult {
  const token = bearer(header);
  const envToken = process.env.OKF_INGEST_TOKEN;
  if (envToken) {
    return token && safeEqual(token, envToken)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  const ws = getWorkspace();
  if (ws?.ingestTokenHash) {
    return token && verifyToken(token, ws.ingestTokenHash)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: false, status: 503, message: 'ingestion not configured; run /setup or set OKF_INGEST_TOKEN' };
}
```

Update `lib/ingest-auth.test.ts` — replace the `cfgWith` helper and its import with v2 shapes (test cases unchanged):

```ts
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
    expect(checkIngestAuth('Bearer x').status).toBe(503);
  });
  it('env token: raw compare (backward compatible)', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer s3cret')).toEqual({ ok: true });
    expect(checkIngestAuth('Bearer nope').status).toBe(401);
    expect(checkIngestAuth(null).status).toBe(401);
  });
  it('config hash: verifies a token against the default workspace sha256', () => {
    const token = generateToken();
    writeConfig(cfgWith(hashToken(token)));
    expect(checkIngestAuth(`Bearer ${token}`)).toEqual({ ok: true });
    expect(checkIngestAuth('Bearer wrong').status).toBe(401);
  });
  it('env token wins over config hash', () => {
    process.env.OKF_INGEST_TOKEN = 'envwins';
    writeConfig(cfgWith(hashToken('other')));
    expect(checkIngestAuth('Bearer envwins')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 5: Mechanical consumer update — `app/lib/setup-actions.ts`**

Same external signatures; internals write/read v2 (single workspace = default). Replace the file:

```ts
'use server';
import { headers } from 'next/headers';
import {
  readConfig, writeConfig, setupState, workspaceSlug,
  type OkfConfig, type BundleConfig, type WorkspaceConfig,
} from '../../lib/config';
import { generateToken, hashToken, hashPassword, verifyPassword, randomSecret } from '../../lib/secrets';
import { validateLocalPath, cloneGitBundle } from '../../lib/bundle-source';
import { resetService } from './service';
import { isAdmin, setAdminSession, clearAdminSession } from './admin-session';

export interface SetupInput {
  workspaceName: string;
  bundleSource: 'example' | 'local' | 'git';
  localPath?: string;
  gitUrl?: string;
  adminPassword: string;
}

interface BundleInput {
  bundleSource: 'example' | 'local' | 'git';
  localPath?: string;
  gitUrl?: string;
}

function resolveBundle(input: BundleInput): { ok: true; bundle: BundleConfig } | { ok: false; error: string } {
  if (input.bundleSource === 'example') {
    return { ok: true, bundle: { source: 'example', path: 'bundles/example' } };
  }
  if (input.bundleSource === 'local') {
    const r = validateLocalPath((input.localPath ?? '').trim());
    return r.ok ? { ok: true, bundle: { source: 'local', path: r.path } } : r;
  }
  const r = cloneGitBundle((input.gitUrl ?? '').trim());
  return r.ok ? { ok: true, bundle: { source: 'git', path: r.path, gitUrl: (input.gitUrl ?? '').trim() } } : r;
}

async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').split(',')[0]?.trim() === 'https';
}

function buildMcpCommand(slug: string, token: string): string {
  return `claude mcp add --transport http okf-${slug} http://localhost:3000/w/${slug}/api/mcp --header "Authorization: Bearer ${token}"`;
}

export async function completeSetup(
  input: SetupInput,
): Promise<{ ok: true; token: string; mcpCommand: string } | { ok: false; error: string }> {
  if (setupState() !== 'first-run') return { ok: false, error: 'setup already completed' };
  if (!input.workspaceName?.trim()) return { ok: false, error: 'workspace name is required' };
  if (!input.adminPassword || input.adminPassword.length < 8) {
    return { ok: false, error: 'admin password must be at least 8 characters' };
  }
  const bundle = resolveBundle(input);
  if (!bundle.ok) return bundle;

  const now = new Date().toISOString();
  const token = generateToken();
  const slug = workspaceSlug(input.workspaceName.trim(), []);
  const workspace: WorkspaceConfig = {
    slug,
    name: input.workspaceName.trim(),
    bundle: bundle.bundle,
    ingestTokenHash: hashToken(token),
    createdAt: now,
  };
  const config: OkfConfig = {
    version: 2,
    adminPasswordHash: hashPassword(input.adminPassword),
    sessionSecret: randomSecret(),
    setupComplete: true,
    defaultWorkspace: slug,
    workspaces: [workspace],
    createdAt: now,
  };
  writeConfig(config);
  resetService();
  return { ok: true, token, mcpCommand: buildMcpCommand(slug, token) };
}

export async function adminLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = readConfig();
  if (!cfg?.setupComplete) return { ok: false, error: 'not configured' };
  if (!verifyPassword(password, cfg.adminPasswordHash)) return { ok: false, error: 'wrong password' };
  await setAdminSession(await isSecureRequest());
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  await clearAdminSession();
}

function updateWorkspace(
  cfg: OkfConfig, slug: string, patch: Partial<WorkspaceConfig>,
): OkfConfig {
  return { ...cfg, workspaces: cfg.workspaces.map((w) => (w.slug === slug ? { ...w, ...patch } : w)) };
}

export async function rotateToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const token = generateToken();
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { ingestTokenHash: hashToken(token) }));
  return { ok: true, token };
}

export async function renameWorkspace(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!name.trim()) return { ok: false, error: 'name is required' };
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { name: name.trim() }));
  return { ok: true };
}

export async function changeBundle(
  input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const bundle = resolveBundle({ bundleSource: input.source, localPath: input.localPath, gitUrl: input.gitUrl });
  if (!bundle.ok) return bundle;
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { bundle: bundle.bundle }));
  resetService();
  return { ok: true };
}
```

- [ ] **Step 6: Mechanical consumer update — `app/setup/page.tsx` display fields**

Change the import line and the settings display to read the default workspace:

```tsx
import { setupState, readConfig, getWorkspace } from '../../lib/config';
```

In the admin settings branch, after `const cfg = readConfig();` add `const ws = getWorkspace();` and replace displays:
- `<h1>Settings — {cfg?.workspaceName}</h1>` → `<h1>Settings — {ws?.name}</h1>`
- `defaultValue={cfg?.workspaceName}` → `defaultValue={ws?.name}`
- `defaultValue={cfg?.bundle.source}` → `defaultValue={ws?.bundle.source}`
- `Current bundle: <code>{cfg?.bundle.source}</code> · <code>{cfg?.bundle.path}</code>` → `Current bundle: <code>{ws?.bundle.source}</code> · <code>{ws?.bundle.path}</code>`

(The `cfg` variable is still used for the `!admin` gate — keep it.)

- [ ] **Step 7: Update the two remaining v1-fixture test files**

Replace the `beforeAll` config block in `app/lib/service-config.test.ts` (imports gain nothing; only the fixture changes):

```ts
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
    version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
    setupComplete: true, defaultWorkspace: 'w',
    workspaces: [{ slug: 'w', name: 'W', bundle: { source: 'local', path: bundleDir }, ingestTokenHash: 'a'.repeat(64), createdAt: '2026-07-06T00:00:00Z' }],
    createdAt: '2026-07-06T00:00:00Z',
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
```

In `app/lib/setup-actions.test.ts`, replace the first test's assertions (v2 shape; other tests unchanged):

```ts
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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run lib/config.test.ts lib/ingest-auth.test.ts app/lib/service-config.test.ts app/lib/setup-actions.test.ts && npm test && npm run typecheck`
Expected: targeted files PASS; FULL suite green (the wizard's completion test asserts `toContain('/api/mcp')`, which `/w/acme/api/mcp` satisfies); typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add lib/config.ts lib/config.test.ts lib/ingest-auth.ts lib/ingest-auth.test.ts app/lib/setup-actions.ts app/lib/setup-actions.test.ts app/lib/service-config.test.ts app/setup/page.tsx
git commit -m "feat(config): workspace-aware config v2 with v1 auto-migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Service registry + slug-threaded work-api/actions

**Files:**
- Modify: `app/lib/service.ts`, `app/lib/work-api.ts`, `app/lib/actions.ts`
- Test: `app/lib/service-registry.test.ts` (create)

**Interfaces:**
- Consumes: `resolveBundleDir(slug?)`, `defaultWorkspaceSlug()` (Task 1).
- Produces:
  - `getService(slug?: string): Promise<OkfService>`
  - `resetService(slug?: string): void` — with slug resets that workspace; without resets **all**.
  - Every export of `work-api.ts` gains a trailing `slug?: string` param: `recordWork(input, slug?)`, `recentWork(filter?, slug?)`, `searchMemory(query, slug?)`, `getConceptFull(path, slug?)`, `graph(path, depth?, slug?)`.
  - `actions.ts`: `validateAction(path, content, slug?)`, `saveAction(path, content, slug?)`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/service-registry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/service-registry.test.ts`
Expected: FAIL — `getService('b')` not accepted / both slugs serve the same singleton.

- [ ] **Step 3: Rewrite `app/lib/service.ts`**

```ts
import 'server-only';
import { createService, type OkfService } from '../../lib/okf-service';
import { resolveBundleDir, defaultWorkspaceSlug } from '../../lib/config';

const cache = globalThis as unknown as { __okfServices?: Map<string, Promise<OkfService>> };

function services(): Map<string, Promise<OkfService>> {
  if (!cache.__okfServices) cache.__okfServices = new Map();
  return cache.__okfServices;
}

function keyFor(slug?: string): string {
  return slug ?? defaultWorkspaceSlug() ?? '__default';
}

export function getService(slug?: string): Promise<OkfService> {
  const map = services();
  const key = keyFor(slug);
  let entry = map.get(key);
  if (!entry) {
    entry = createService(resolveBundleDir(slug));
    map.set(key, entry);
  }
  return entry;
}

function closeEntry(entry: Promise<OkfService> | undefined): void {
  if (entry) entry.then((svc) => svc.close()).catch(() => {});
}

export function resetService(slug?: string): void {
  const map = services();
  if (slug === undefined) {
    for (const entry of map.values()) closeEntry(entry);
    map.clear();
    return;
  }
  const key = keyFor(slug);
  closeEntry(map.get(key));
  map.delete(key);
}
```

- [ ] **Step 4: Thread `slug` through `app/lib/work-api.ts`**

```ts
import 'server-only';
import { getService, resetService } from './service';
import { buildWorkRecordSource, type WorkRecordInput } from '../../lib/work-record';
import { saveContent } from '../../lib/edit-ops';
import { resolveBundleDir } from '../../lib/config';
import type { ValidationIssue } from '../../lib/okf-core/types';
import type { WorkRow, SearchHit, ConceptRow, GraphData } from '../../lib/db/queries';

async function knownPaths(slug?: string): Promise<Set<string>> {
  const svc = await getService(slug);
  return new Set(svc.concepts().map((c) => c.path));
}

export async function recordWork(
  input: WorkRecordInput,
  slug?: string,
): Promise<{ ok: boolean; path: string; issues: ValidationIssue[] }> {
  const missing = (['title', 'summary', 'actor'] as const).filter(
    (k) => !(typeof input?.[k] === 'string' && input[k]!.trim()),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      path: '',
      issues: [{ path: '', severity: 'error', field: 'input', message: `missing required: ${missing.join(', ')}` }],
    };
  }
  const now = new Date().toISOString();
  const { path, content } = buildWorkRecordSource(input, now);
  let result: Awaited<ReturnType<typeof saveContent>>;
  try {
    result = await saveContent(resolveBundleDir(slug), path, content, await knownPaths(slug));
  } catch (err) {
    return {
      ok: false,
      path: '',
      issues: [{ path: '', severity: 'error', field: 'write', message: err instanceof Error ? err.message : String(err) }],
    };
  }
  if (result.ok) resetService(slug); // clears the workspace's cached service; omitted slug clears all (single-ws legacy)
  return { ok: result.ok, path: result.ok ? path : '', issues: result.issues };
}

export async function recentWork(
  filter: { project?: string; actor?: string; limit?: number } = {},
  slug?: string,
): Promise<WorkRow[]> {
  return (await getService(slug)).recentWork(filter);
}

export async function searchMemory(query: string, slug?: string): Promise<SearchHit[]> {
  return (await getService(slug)).search(query);
}

export async function getConceptFull(path: string, slug?: string): Promise<ConceptRow | undefined> {
  return (await getService(slug)).concept(path);
}

export async function graph(path: string, depth?: number, slug?: string): Promise<GraphData> {
  return (await getService(slug)).graph(path, depth);
}
```

- [ ] **Step 5: Thread `slug` through `app/lib/actions.ts`**

```ts
'use server';
import { getService, resetService } from './service';
import { validateContent, saveContent } from '../../lib/edit-ops';
import { resolveBundleDir } from '../../lib/config';
import type { ValidationIssue } from '../../lib/okf-core/types';

async function knownPaths(slug?: string): Promise<Set<string>> {
  const svc = await getService(slug);
  return new Set(svc.concepts().map((c) => c.path));
}

export async function validateAction(
  path: string,
  content: string,
  slug?: string,
): Promise<{ issues: ValidationIssue[]; html: string }> {
  return validateContent(path, content, await knownPaths(slug));
}

export async function saveAction(
  path: string,
  content: string,
  slug?: string,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const result = await saveContent(resolveBundleDir(slug), path, content, await knownPaths(slug));
  if (result.ok) resetService(slug);
  return result;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/lib/service-registry.test.ts app/lib/service-reset.test.ts app/lib/service-config.test.ts && npm test && npm run typecheck`
Expected: registry test PASS; `service-reset` still passes (no-arg reset = reset all incl. the one); full suite green; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add app/lib/service.ts app/lib/work-api.ts app/lib/actions.ts app/lib/service-registry.test.ts
git commit -m "feat(service): slug-keyed service registry + workspace-threaded work-api/actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Workspace-aware ingest auth

**Files:**
- Modify: `lib/ingest-auth.ts`
- Test: `lib/ingest-auth.test.ts` (extend)

**Interfaces:**
- Produces: `checkIngestAuth(header: string | null, slug?: string): AuthResult` — env token valid on any slug; per-workspace hash otherwise; 503 when no workspace resolves.

- [ ] **Step 1: Extend the test**

Append to `lib/ingest-auth.test.ts` (keep everything from Task 1; add a two-workspace fixture and this describe):

```ts
const cfgTwo = (hashA: string, hashB: string): OkfConfig => ({
  version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
  setupComplete: true, defaultWorkspace: 'a',
  workspaces: [
    { slug: 'a', name: 'A', bundle: { source: 'example', path: 'bundles/example' }, ingestTokenHash: hashA, createdAt: '2026-07-06T00:00:00Z' },
    { slug: 'b', name: 'B', bundle: { source: 'example', path: 'bundles/example' }, ingestTokenHash: hashB, createdAt: '2026-07-06T00:00:00Z' },
  ],
  createdAt: '2026-07-06T00:00:00Z',
});

describe('checkIngestAuth per workspace', () => {
  it('verifies against the addressed workspace and isolates tokens', () => {
    const tokenA = generateToken();
    const tokenB = generateToken();
    writeConfig(cfgTwo(hashToken(tokenA), hashToken(tokenB)));
    expect(checkIngestAuth(`Bearer ${tokenA}`, 'a')).toEqual({ ok: true });
    expect(checkIngestAuth(`Bearer ${tokenB}`, 'b')).toEqual({ ok: true });
    expect(checkIngestAuth(`Bearer ${tokenA}`, 'b').status).toBe(401); // cross-workspace → 401
    expect(checkIngestAuth(`Bearer ${tokenA}`)).toEqual({ ok: true }); // omitted slug → default (a)
    expect(checkIngestAuth(`Bearer ${tokenA}`, 'nope').status).toBe(503); // unknown ws → unconfigured
  });
  it('env token is valid on any workspace (env wins)', () => {
    process.env.OKF_INGEST_TOKEN = 'hubwide';
    writeConfig(cfgTwo('x'.repeat(64), 'y'.repeat(64)));
    expect(checkIngestAuth('Bearer hubwide', 'a')).toEqual({ ok: true });
    expect(checkIngestAuth('Bearer hubwide', 'b')).toEqual({ ok: true });
    expect(checkIngestAuth('Bearer nope', 'b').status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest-auth.test.ts`
Expected: FAIL — `checkIngestAuth` does not accept a second argument (TS error) / wrong workspace resolution.

- [ ] **Step 3: Add the `slug` parameter**

In `lib/ingest-auth.ts`, change only the signature and the workspace lookup:

```ts
export function checkIngestAuth(header: string | null, slug?: string): AuthResult {
  const token = bearer(header);
  const envToken = process.env.OKF_INGEST_TOKEN;
  if (envToken) {
    return token && safeEqual(token, envToken)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  const ws = getWorkspace(slug);
  if (ws?.ingestTokenHash) {
    return token && verifyToken(token, ws.ingestTokenHash)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: false, status: 503, message: 'ingestion not configured; run /setup or set OKF_INGEST_TOKEN' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ingest-auth.test.ts && npm run typecheck`
Expected: PASS (6 cases), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest-auth.ts lib/ingest-auth.test.ts
git commit -m "feat(auth): per-workspace ingest tokens with cross-workspace isolation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Workspace management server actions

**Files:**
- Modify: `app/lib/setup-actions.ts`, `app/setup/page.tsx` (rebind changed signatures only)
- Test: `app/lib/setup-actions.test.ts` (extend)

**Interfaces:**
- Consumes: `workspaceSlug`, `getWorkspace`, `readConfig`, `writeConfig` (Task 1); `resetService(slug?)` (Task 2); `isAdmin` (existing).
- Produces (all `'use server'`, admin-gated):
  - `addWorkspace(input: { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string }): Promise<{ ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string }>`
  - `renameWorkspace(slug: string, name: string): Promise<{ ok: boolean; error?: string }>` **(signature change)**
  - `changeBundle(slug: string, input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string }): Promise<{ ok: boolean; error?: string }>` **(signature change)**
  - `rotateToken(slug: string): Promise<{ ok: boolean; token?: string; error?: string }>` **(signature change)**
  - `deleteWorkspace(slug: string): Promise<{ ok: boolean; error?: string }>`
  - `setDefaultWorkspace(slug: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Extend the test**

In `app/lib/setup-actions.test.ts`: add `getWorkspace` to the config import, add `import { isAdmin } from './admin-session';` (it is already mocked at the top of the file), and append:

```ts
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
```

Also update the existing admin-gate test (rotateToken now needs a slug):

```ts
describe('admin gate', () => {
  it('rotateToken is refused without an admin session', async () => {
    const { completeSetup, rotateToken } = await import('./setup-actions');
    await completeSetup({ workspaceName: 'A', bundleSource: 'example', adminPassword: 'longenough' });
    const res = await rotateToken('a'); // isAdmin() mocked to false
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/setup-actions.test.ts`
Expected: FAIL — `addWorkspace`/`deleteWorkspace`/`setDefaultWorkspace` missing; `rotateToken('labs')` rejects the argument.

- [ ] **Step 3: Update the actions**

In `app/lib/setup-actions.ts`, replace `rotateToken`, `renameWorkspace`, `changeBundle` and append the new actions (imports already present from Task 1; add `getWorkspace` to the config import):

```ts
export async function rotateToken(slug: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  const token = generateToken();
  writeConfig(updateWorkspace(cfg, slug, { ingestTokenHash: hashToken(token) }));
  return { ok: true, token };
}

export async function renameWorkspace(slug: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  if (!name.trim()) return { ok: false, error: 'name is required' };
  writeConfig(updateWorkspace(cfg, slug, { name: name.trim() }));
  return { ok: true };
}

export async function changeBundle(
  slug: string,
  input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  const bundle = resolveBundle({ bundleSource: input.source, localPath: input.localPath, gitUrl: input.gitUrl });
  if (!bundle.ok) return bundle;
  writeConfig(updateWorkspace(cfg, slug, { bundle: bundle.bundle }));
  resetService(slug);
  return { ok: true };
}

export async function addWorkspace(
  input: { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!input.name?.trim()) return { ok: false, error: 'workspace name is required' };
  const bundle = resolveBundle(input);
  if (!bundle.ok) return bundle;
  const slug = workspaceSlug(input.name.trim(), cfg.workspaces.map((w) => w.slug));
  const token = generateToken();
  const workspace: WorkspaceConfig = {
    slug,
    name: input.name.trim(),
    bundle: bundle.bundle,
    ingestTokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
  };
  writeConfig({ ...cfg, workspaces: [...cfg.workspaces, workspace] });
  return { ok: true, slug, token, mcpCommand: buildMcpCommand(slug, token) };
}

export async function deleteWorkspace(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  if (cfg.workspaces.length <= 1) return { ok: false, error: 'cannot delete the last workspace' };
  const remaining = cfg.workspaces.filter((w) => w.slug !== slug);
  const defaultWorkspace = cfg.defaultWorkspace === slug ? remaining[0]!.slug : cfg.defaultWorkspace;
  writeConfig({ ...cfg, workspaces: remaining, defaultWorkspace });
  resetService(slug);
  return { ok: true };
}

export async function setDefaultWorkspace(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  writeConfig({ ...cfg, defaultWorkspace: slug });
  return { ok: true };
}
```

- [ ] **Step 4: Rebind the changed signatures in `app/setup/page.tsx`**

The settings branch must compile against the new signatures (full redesign happens in Task 7). Minimal edits — the settings branch already has `const ws = getWorkspace();`; guard and bind:

- Rename form action: `await renameWorkspace(String(fd.get('name') ?? ''))` → `await renameWorkspace(ws?.slug ?? '', String(fd.get('name') ?? ''))`
- Rotate panel: `<RotateTokenPanel onRotate={rotateToken} />` → `<RotateTokenPanel onRotate={rotateToken.bind(null, ws?.slug ?? '')} />`
- Change-bundle form action: `await changeBundle({ source: … })` → `await changeBundle(ws?.slug ?? '', { source: … })` (same object second).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/lib/setup-actions.test.ts && npm test && npm run typecheck`
Expected: all setup-actions cases PASS (old 4 + new 6 + gate); full suite green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/lib/setup-actions.ts app/lib/setup-actions.test.ts app/setup/page.tsx
git commit -m "feat(setup): workspace management actions (add/rename/bundle/rotate/delete/default)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Shared REST handlers + `/w/[ws]/api/v1/*` routes

**Files:**
- Create: `app/lib/api-handlers.ts`, `app/w/[ws]/api/v1/work/route.ts`, `app/w/[ws]/api/v1/search/route.ts`, `app/w/[ws]/api/v1/concept/route.ts`, `app/w/[ws]/api/v1/graph/route.ts`
- Modify: `app/api/v1/work/route.ts`, `app/api/v1/search/route.ts`, `app/api/v1/concept/route.ts`, `app/api/v1/graph/route.ts` (become thin delegates)
- Test: `app/w/workspace-api.test.ts` (create)

**Interfaces:**
- Consumes: `checkIngestAuth(header, slug?)` (Task 3), work-api slug params (Task 2), `getWorkspace` (Task 1).
- Produces (in `app/lib/api-handlers.ts`):
  - `requireWorkspace(slug: string): Response | null` — 404 JSON when unknown, else null
  - `handleWorkGET(req: Request, slug?: string): Promise<Response>`
  - `handleWorkPOST(req: Request, slug?: string): Promise<Response>`
  - `handleSearchGET(req: Request, slug?: string): Promise<Response>`
  - `handleConceptGET(req: Request, slug?: string): Promise<Response>`
  - `handleGraphGET(req: Request, slug?: string): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Create `app/w/workspace-api.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeConfig, invalidateConfigCache, type OkfConfig } from '../../lib/config';
import { generateToken, hashToken } from '../../lib/secrets';

let cfgDir: string;
let bundleA: string;
let bundleB: string;
const tokenA = generateToken();
const tokenB = generateToken();
const origToken = process.env.OKF_INGEST_TOKEN;
const origBundle = process.env.OKF_BUNDLE_DIR;

const ctx = (ws: string) => ({ params: Promise.resolve({ ws }) });
const post = (ws: string, body: unknown, auth?: string) =>
  new Request(`http://t/w/${ws}/api/v1/work`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  cfgDir = mkdtempSync(join(tmpdir(), 'okf-wapi-cfg-'));
  bundleA = mkdtempSync(join(tmpdir(), 'okf-wapi-a-'));
  bundleB = mkdtempSync(join(tmpdir(), 'okf-wapi-b-'));
  writeFileSync(join(bundleA, 'a.md'), '---\ntype: index\ntitle: Alpha\n---\nalpha seed\n');
  writeFileSync(join(bundleB, 'b.md'), '---\ntype: index\ntitle: Beta\n---\nbeta seed\n');
  process.env.OKF_CONFIG_DIR = cfgDir;
  delete process.env.OKF_INGEST_TOKEN;
  delete process.env.OKF_BUNDLE_DIR;
  invalidateConfigCache();
  const cfg: OkfConfig = {
    version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
    setupComplete: true, defaultWorkspace: 'a',
    workspaces: [
      { slug: 'a', name: 'A', bundle: { source: 'local', path: bundleA }, ingestTokenHash: hashToken(tokenA), createdAt: '2026-07-06T00:00:00Z' },
      { slug: 'b', name: 'B', bundle: { source: 'local', path: bundleB }, ingestTokenHash: hashToken(tokenB), createdAt: '2026-07-06T00:00:00Z' },
    ],
    createdAt: '2026-07-06T00:00:00Z',
  };
  writeConfig(cfg);
  const { resetService } = await import('../lib/service');
  resetService();
});
afterAll(async () => {
  const { resetService } = await import('../lib/service');
  resetService();
  rmSync(cfgDir, { recursive: true, force: true });
  rmSync(bundleA, { recursive: true, force: true });
  rmSync(bundleB, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  if (origToken !== undefined) process.env.OKF_INGEST_TOKEN = origToken;
  if (origBundle !== undefined) process.env.OKF_BUNDLE_DIR = origBundle;
  invalidateConfigCache();
});

describe('/w/[ws]/api/v1/work', () => {
  it('404 for an unknown workspace', async () => {
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('nope', { title: 'x', summary: 'y', actor: 'z' }, `Bearer ${tokenA}`), ctx('nope'))).status).toBe(404);
  });
  it("201 with the workspace's own token; record lands in that workspace", async () => {
    const { POST, GET } = await import('./[ws]/api/v1/work/route');
    const res = await POST(post('b', { title: 'In B', summary: 's', actor: 'me', project: 'p' }, `Bearer ${tokenB}`), ctx('b'));
    expect(res.status).toBe(201);
    const list = await (await GET(new Request('http://t/w/b/api/v1/work?project=p'), ctx('b'))).json();
    expect(list.work.length).toBe(1);
    // and it is NOT in workspace a
    const listA = await (await GET(new Request('http://t/w/a/api/v1/work?project=p'), ctx('a'))).json();
    expect(listA.work.length).toBe(0);
  });
  it("401 with the OTHER workspace's token (isolation)", async () => {
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('a', { title: 'x', summary: 'y', actor: 'z' }, `Bearer ${tokenB}`), ctx('a'))).status).toBe(401);
  });
  it('env token works on any workspace (env wins)', async () => {
    process.env.OKF_INGEST_TOKEN = 'hubwide';
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('a', { title: 'Env', summary: 's', actor: 'me' }, 'Bearer hubwide'), ctx('a'))).status).toBe(201);
    delete process.env.OKF_INGEST_TOKEN;
  });
});

describe('/w/[ws]/api/v1 read routes', () => {
  it('search + concept are workspace-scoped', async () => {
    const search = (await import('./[ws]/api/v1/search/route')).GET;
    const bodyB = await (await search(new Request('http://t/w/b/api/v1/search?q=beta'), ctx('b'))).json();
    expect(bodyB.hits.length).toBeGreaterThan(0);
    const bodyA = await (await search(new Request('http://t/w/a/api/v1/search?q=beta'), ctx('a'))).json();
    expect(bodyA.hits.length).toBe(0);

    const concept = (await import('./[ws]/api/v1/concept/route')).GET;
    expect((await concept(new Request('http://t/w/a/api/v1/concept?path=a.md'), ctx('a'))).status).toBe(200);
    expect((await concept(new Request('http://t/w/b/api/v1/concept?path=a.md'), ctx('b'))).status).toBe(404);
  });
  it('graph 404s on an unknown workspace', async () => {
    const { GET } = await import('./[ws]/api/v1/graph/route');
    expect((await GET(new Request('http://t/w/nope/api/v1/graph?path=a.md'), ctx('nope'))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/w/workspace-api.test.ts`
Expected: FAIL — cannot resolve `./[ws]/api/v1/work/route`.

- [ ] **Step 3: Create `app/lib/api-handlers.ts`** (logic moved verbatim from the legacy routes, plus slug threading)

```ts
import 'server-only';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from './work-api';
import { checkIngestAuth } from '../../lib/ingest-auth';
import { getWorkspace } from '../../lib/config';
import type { WorkRecordInput } from '../../lib/work-record';

export function requireWorkspace(slug: string): Response | null {
  if (getWorkspace(slug)) return null;
  return Response.json({ error: 'unknown workspace' }, { status: 404 });
}

export async function handleWorkGET(req: Request, slug?: string): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  const rows = await recentWork({ project, actor, limit: Number.isFinite(limit) ? limit : undefined }, slug);
  return Response.json({ work: rows });
}

export async function handleWorkPOST(req: Request, slug?: string): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'), slug);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  let body: WorkRecordInput;
  try {
    body = (await req.json()) as WorkRecordInput;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const result = await recordWork(body, slug);
  if (!result.ok) return Response.json({ error: 'validation failed', issues: result.issues }, { status: 422 });
  return Response.json({ ok: true, path: result.path }, { status: 201 });
}

export async function handleSearchGET(req: Request, slug?: string): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const hits = await searchMemory(q, slug);
  return Response.json({ query: q, hits });
}

export async function handleConceptGET(req: Request, slug?: string): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const concept = await getConceptFull(path, slug);
  if (!concept) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ concept });
}

export async function handleGraphGET(req: Request, slug?: string): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const depthRaw = url.searchParams.get('depth');
  const depth = depthRaw !== null ? Number(depthRaw) : undefined;
  const data = await graph(path, Number.isFinite(depth) ? depth : undefined, slug);
  return Response.json({ graph: data });
}
```

- [ ] **Step 4: Create the four `/w/[ws]` routes**

`app/w/[ws]/api/v1/work/route.ts`:

```ts
import { requireWorkspace, handleWorkGET, handleWorkPOST } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ws: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleWorkGET(req, ws);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleWorkPOST(req, ws);
}
```

`app/w/[ws]/api/v1/search/route.ts`:

```ts
import { requireWorkspace, handleSearchGET } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleSearchGET(req, ws);
}
```

`app/w/[ws]/api/v1/concept/route.ts`:

```ts
import { requireWorkspace, handleConceptGET } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleConceptGET(req, ws);
}
```

`app/w/[ws]/api/v1/graph/route.ts`:

```ts
import { requireWorkspace, handleGraphGET } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleGraphGET(req, ws);
}
```

- [ ] **Step 5: Slim the legacy routes to delegates**

`app/api/v1/work/route.ts`:

```ts
import { handleWorkGET, handleWorkPOST } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleWorkGET(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleWorkPOST(req);
}
```

`app/api/v1/search/route.ts`:

```ts
import { handleSearchGET } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleSearchGET(req);
}
```

`app/api/v1/concept/route.ts`:

```ts
import { handleConceptGET } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleConceptGET(req);
}
```

`app/api/v1/graph/route.ts`:

```ts
import { handleGraphGET } from '../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return handleGraphGET(req);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/w/workspace-api.test.ts app/api/v1/routes.test.ts && npm test && npm run typecheck && npm run build`
Expected: new workspace-api tests PASS; legacy routes.test.ts unchanged and green; full suite green; build compiles the new `/w/[ws]/api/v1/*` routes.

- [ ] **Step 7: Commit**

```bash
git add app/lib/api-handlers.ts 'app/w/[ws]/api/v1' app/api/v1/work/route.ts app/api/v1/search/route.ts app/api/v1/concept/route.ts app/api/v1/graph/route.ts app/w/workspace-api.test.ts
git commit -m "feat(api): per-workspace REST under /w/[ws]/api/v1 via shared handlers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Per-workspace MCP (memoized handler factory)

**Files:**
- Create: `app/lib/mcp.ts`, `app/w/[ws]/api/[transport]/route.ts`
- Modify: `app/api/[transport]/route.ts` (use the factory)
- Test: `app/lib/mcp.test.ts` (create)

**Interfaces:**
- Consumes: work-api slug params (Task 2), `checkIngestAuth(header, slug?)` (Task 3), `requireWorkspace` (Task 5).
- Produces: `mcpHandlerFor(slug: string | undefined, basePath: string): (req: Request) => Promise<Response>` — memoized per `basePath`; tools close over `slug`.

- [ ] **Step 1: Write the failing test**

Create `app/lib/mcp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mcpHandlerFor } from './mcp';

describe('mcpHandlerFor', () => {
  it('memoizes one handler per basePath and separates workspaces', () => {
    const a1 = mcpHandlerFor('a', '/w/a/api');
    const a2 = mcpHandlerFor('a', '/w/a/api');
    const b = mcpHandlerFor('b', '/w/b/api');
    const legacy = mcpHandlerFor(undefined, '/api');
    expect(a1).toBe(a2);        // memoized
    expect(a1).not.toBe(b);     // distinct mounts
    expect(a1).not.toBe(legacy);
    expect(typeof legacy).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/mcp.test.ts`
Expected: FAIL — cannot resolve `./mcp`.

- [ ] **Step 3: Create `app/lib/mcp.ts`** (tool definitions moved from the legacy route; note they now pass `slug`)

```ts
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from './work-api';

type McpHandler = (req: Request) => Promise<Response>;

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

// createMcpHandler's basePath is static per instance, so each mount gets its own
// handler, memoized on globalThis (mirrors the service registry pattern).
const cache = globalThis as unknown as { __okfMcpHandlers?: Map<string, McpHandler> };

export function mcpHandlerFor(slug: string | undefined, basePath: string): McpHandler {
  if (!cache.__okfMcpHandlers) cache.__okfMcpHandlers = new Map();
  const map = cache.__okfMcpHandlers;
  let handler = map.get(basePath);
  if (!handler) {
    handler = createMcpHandler(
      (server) => {
        server.tool(
          'okf_record_work',
          'Record a completed unit of work into the org memory as an OKF WorkRecord.',
          {
            title: z.string(),
            summary: z.string(),
            actor: z.string(),
            project: z.string().optional(),
            tags: z.array(z.string()).optional(),
            artifacts: z.array(z.string()).optional(),
            links: z.array(z.string()).optional(),
          },
          async (args) => {
            const r = await recordWork(args, slug);
            return text(r.ok ? `recorded: ${r.path}` : `rejected: ${JSON.stringify(r.issues)}`);
          },
        );
        server.tool(
          'okf_recent_work',
          'List recent WorkRecords, optionally filtered by project or actor.',
          { project: z.string().optional(), actor: z.string().optional(), limit: z.number().optional() },
          async (args) => text(await recentWork(args, slug)),
        );
        server.tool(
          'okf_search',
          'Full-text search across the org memory.',
          { query: z.string() },
          async ({ query }) => text(await searchMemory(query, slug)),
        );
        server.tool(
          'okf_get',
          'Get the full content of one concept or WorkRecord by its bundle path.',
          { path: z.string() },
          async ({ path }) => {
            const c = await getConceptFull(path, slug);
            return text(c ?? 'not found');
          },
        );
        server.tool(
          'okf_graph',
          'Get the graph neighborhood of a concept by path.',
          { path: z.string(), depth: z.number().optional() },
          async ({ path, depth }) => text(await graph(path, depth, slug)),
        );
      },
      {},
      { basePath },
    );
    map.set(basePath, handler);
  }
  return handler;
}
```

- [ ] **Step 4: Replace `app/api/[transport]/route.ts`** (legacy mount = default workspace)

```ts
import { mcpHandlerFor } from '../../lib/mcp';
import { checkIngestAuth } from '../../../lib/ingest-auth';

export const runtime = 'nodejs';

async function authed(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return mcpHandlerFor(undefined, '/api')(req);
}

export { authed as GET, authed as POST, authed as DELETE };
```

- [ ] **Step 5: Create `app/w/[ws]/api/[transport]/route.ts`**

```ts
import { mcpHandlerFor } from '../../../../lib/mcp';
import { requireWorkspace } from '../../../../lib/api-handlers';
import { checkIngestAuth } from '../../../../../lib/ingest-auth';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ ws: string; transport: string }> };

async function authed(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  const missing = requireWorkspace(ws);
  if (missing) return missing;
  const auth = checkIngestAuth(req.headers.get('authorization'), ws);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return mcpHandlerFor(ws, `/w/${ws}/api`)(req);
}

export { authed as GET, authed as POST, authed as DELETE };
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run app/lib/mcp.test.ts && npm test && npm run typecheck && npm run build`
Expected: memoization test PASS; full suite green; build compiles both MCP mounts. **This does NOT prove the runtime mount — Task 8's smoke does.**

- [ ] **Step 7: Commit**

```bash
git add app/lib/mcp.ts app/lib/mcp.test.ts 'app/api/[transport]/route.ts' 'app/w/[ws]/api/[transport]/route.ts'
git commit -m "feat(mcp): per-workspace MCP mounts via memoized handler factory

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Workspace management UI (settings redesign + add/delete components)

**Files:**
- Create: `app/components/add-workspace.tsx`, `app/components/add-workspace.test.tsx`, `app/components/workspace-delete.tsx`, `app/components/workspace-delete.test.tsx`
- Modify: `app/setup/page.tsx` (admin settings branch lists workspaces), `app/globals.css` (workspace card styles)

**Interfaces:**
- Consumes: `addWorkspace`, `deleteWorkspace`, `setDefaultWorkspace`, `renameWorkspace(slug, name)`, `changeBundle(slug, input)`, `rotateToken(slug)` (Task 4); `CopyButton` from `app/components/copy-button` (existing); `readConfig` (Task 1).
- Produces:
  - `AddWorkspacePanel({ onAdd }: { onAdd: (input: { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string }) => Promise<{ ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string }> })`
  - `WorkspaceDeleteButton({ slug, name, onDelete }: { slug: string; name: string; onDelete: (slug: string) => Promise<{ ok: boolean; error?: string }> })`

- [ ] **Step 1: Write the failing tests**

Create `app/components/add-workspace.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AddWorkspacePanel } from './add-workspace';

afterEach(() => { cleanup(); refresh.mockClear(); });

describe('AddWorkspacePanel', () => {
  it('creates a workspace and shows the one-time token + mcp command', async () => {
    const onAdd = vi.fn(async () => ({
      ok: true as const, slug: 'labs', token: 'WSTOKEN42', mcpCommand: 'claude mcp add ... /w/labs/api/mcp ... Bearer WSTOKEN42',
    }));
    render(<AddWorkspacePanel onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText(/new workspace name/i), { target: { value: 'Labs' } });
    fireEvent.click(screen.getByRole('button', { name: /add workspace/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Labs', bundleSource: 'example' }),
    ));
    expect(await screen.findByText('WSTOKEN42')).toBeTruthy();
    expect(screen.getByText(/\/w\/labs\/api\/mcp/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled(); // list re-renders behind the panel
  });

  it('shows the error when creation fails', async () => {
    const onAdd = vi.fn(async () => ({ ok: false as const, error: 'workspace name is required' }));
    render(<AddWorkspacePanel onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /add workspace/i }));
    expect(await screen.findByText(/name is required/i)).toBeTruthy();
  });
});
```

Create `app/components/workspace-delete.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { WorkspaceDeleteButton } from './workspace-delete';

afterEach(() => { cleanup(); refresh.mockClear(); vi.restoreAllMocks(); });

describe('WorkspaceDeleteButton', () => {
  it('confirms, deletes, and refreshes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(async () => ({ ok: true }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('labs'));
    expect(refresh).toHaveBeenCalled();
  });

  it('does nothing when the confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDelete = vi.fn(async () => ({ ok: true }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the server refusal inline', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn(async () => ({ ok: false, error: 'cannot delete the last workspace' }));
    render(<WorkspaceDeleteButton slug="labs" name="Labs" onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(await screen.findByText(/last workspace/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/components/add-workspace.test.tsx app/components/workspace-delete.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create `app/components/add-workspace.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from './copy-button';

type AddInput = { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string };
type AddResult = { ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string };

export function AddWorkspacePanel({ onAdd }: { onAdd: (input: AddInput) => Promise<AddResult> }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [bundleSource, setBundleSource] = useState<'example' | 'local' | 'git'>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; token: string; mcpCommand: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onAdd({ name, bundleSource, localPath, gitUrl });
      if (res.ok) {
        setDone({ slug: res.slug, token: res.token, mcpCommand: res.mcpCommand });
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add workspace');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="okf-setup__row">
        <h2>Workspace “{done.slug}” created ✓</h2>
        <p className="okf-setup__warn">Copy this workspace&rsquo;s ingestion token now — it will not be shown again.</p>
        <div className="okf-setup__copyrow">
          <pre className="okf-setup__token"><code>{done.token}</code></pre>
          <CopyButton text={done.token} />
        </div>
        <p className="okf-setup__hint">Connect an agent to THIS workspace:</p>
        <div className="okf-setup__copyrow">
          <pre><code>{done.mcpCommand}</code></pre>
          <CopyButton text={done.mcpCommand} />
        </div>
      </section>
    );
  }

  return (
    <form className="okf-setup__row" onSubmit={submit}>
      <h2>Add a workspace</h2>
      <p className="okf-setup__hint">Each workspace has its own bundle, search index, token, and URL (/w/&lt;slug&gt;).</p>
      <label>New workspace name
        <input aria-label="new workspace name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Labs" />
      </label>
      <fieldset className="okf-setup__bundle">
        <legend>Bundle source</legend>
        <label><input type="radio" name="add-src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
        <label><input type="radio" name="add-src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
        {bundleSource === 'local' && (
          <input aria-label="new local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
        )}
        <label><input type="radio" name="add-src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
        {bundleSource === 'git' && (
          <input aria-label="new git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
        )}
      </fieldset>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add workspace'}</button>
    </form>
  );
}
```

- [ ] **Step 4: Create `app/components/workspace-delete.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WorkspaceDeleteButton({
  slug, name, onDelete,
}: { slug: string; name: string; onDelete: (slug: string) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (!window.confirm(`Delete workspace “${name}” (/w/${slug})? Its agents will lose access. Bundle files on disk are kept.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onDelete(slug);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'delete failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="button" className="okf-setup__danger" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
    </>
  );
}
```

- [ ] **Step 5: Rewrite the admin settings branch of `app/setup/page.tsx`**

Replace the whole file with:

```tsx
import { setupState, readConfig } from '../../lib/config';
import { isAdmin } from '../lib/admin-session';
import {
  completeSetup, adminLogin, rotateToken, renameWorkspace, changeBundle,
  addWorkspace, deleteWorkspace, setDefaultWorkspace,
} from '../lib/setup-actions';
import { SetupWizard } from '../components/setup-wizard';
import { RotateTokenPanel } from '../components/rotate-token';
import { AdminLogin } from '../components/admin-login';
import { AddWorkspacePanel } from '../components/add-workspace';
import { WorkspaceDeleteButton } from '../components/workspace-delete';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const state = setupState();

  if (state === 'env-configured') {
    return (
      <main className="okf-setup okf-screen">
        <h1>Configured via environment</h1>
        <p>This instance is configured with <code>OKF_INGEST_TOKEN</code> / <code>OKF_BUNDLE_DIR</code>. Unset them to use web setup.</p>
      </main>
    );
  }

  if (state === 'first-run') {
    return (
      <main className="okf-setup okf-screen">
        <SetupWizard onComplete={completeSetup} />
      </main>
    );
  }

  const admin = await isAdmin();
  if (!admin) {
    return (
      <main className="okf-setup okf-screen">
        <AdminLogin onLogin={adminLogin} />
      </main>
    );
  }

  const cfg = readConfig();
  const workspaces = cfg?.workspaces ?? [];

  return (
    <main className="okf-setup okf-screen">
      <h1>Workspaces</h1>
      <p className="okf-setup__lede">Signed in as admin. Each workspace has its own bundle, token, and URL; agents connect per workspace.</p>

      {workspaces.map((ws) => (
        <section key={ws.slug} className="okf-setup__ws">
          <div className="okf-setup__ws-head">
            <h2>{ws.name} {cfg?.defaultWorkspace === ws.slug && <span className="okf-setup__badge">default</span>}</h2>
            <span className="okf-setup__hint">/w/{ws.slug} · bundle: {ws.bundle.source} · {ws.bundle.path}</span>
          </div>
          <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await renameWorkspace(ws.slug, String(fd.get('name') ?? '')); }}>
            <label>Workspace name <input name="name" defaultValue={ws.name} /></label>
            <p className="okf-setup__hint">Display name only — the URL slug /w/{ws.slug} never changes.</p>
            <button type="submit">Rename</button>
          </form>
          <RotateTokenPanel onRotate={rotateToken.bind(null, ws.slug)} />
          <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await changeBundle(ws.slug, { source: String(fd.get('source') ?? 'example') as 'example' | 'local' | 'git', localPath: String(fd.get('localPath') ?? ''), gitUrl: String(fd.get('gitUrl') ?? '') }); }}>
            <p className="okf-setup__hint">example = built-in sample data · local = a folder on this server (needs a .md file) · git = clone a public https:// repo.</p>
            <label>Bundle source
              <select name="source" defaultValue={ws.bundle.source}>
                <option value="example">example</option>
                <option value="local">local path</option>
                <option value="git">git url</option>
              </select>
            </label>
            <input name="localPath" aria-label={`bundle local path for ${ws.slug}`} placeholder="/srv/okf-bundle (for local)" />
            <input name="gitUrl" aria-label={`bundle git url for ${ws.slug}`} placeholder="https://… (for git)" />
            <button type="submit">Change bundle</button>
          </form>
          <div className="okf-setup__row okf-setup__ws-actions">
            {cfg?.defaultWorkspace !== ws.slug && (
              <form action={async () => { 'use server'; await setDefaultWorkspace(ws.slug); }}>
                <button type="submit">Make default</button>
              </form>
            )}
            <WorkspaceDeleteButton slug={ws.slug} name={ws.name} onDelete={deleteWorkspace} />
          </div>
        </section>
      ))}

      <AddWorkspacePanel onAdd={addWorkspace} />
    </main>
  );
}
```

- [ ] **Step 6: Append the workspace-card CSS to `app/globals.css`**

```css

/* --- Workspace management --- */
.okf-setup__ws { border: 1px solid #d7deea; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.okf-setup__ws-head h2 { margin: 0; font-size: 1.05rem; }
.okf-setup__badge { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.68rem; background: #eef2fb; color: #2563eb; border-radius: 999px; padding: 2px 8px; margin-left: 8px; vertical-align: middle; }
.okf-setup__ws-actions { flex-direction: row; align-items: center; gap: 10px; }
.okf-setup__danger { background: #b42318 !important; }
```

- [ ] **Step 7: Run tests + build**

Run: `npx vitest run app/components/add-workspace.test.tsx app/components/workspace-delete.test.tsx && npm test && npm run typecheck && npm run build`
Expected: 5 new component cases PASS; full suite green; build compiles `/setup`.

- [ ] **Step 8: Commit**

```bash
git add app/components/add-workspace.tsx app/components/add-workspace.test.tsx app/components/workspace-delete.tsx app/components/workspace-delete.test.tsx app/setup/page.tsx app/globals.css
git commit -m "feat(setup): workspace management UI (list, add with one-time token, delete, default)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: README + controller runtime smoke + final verification

**Files:**
- Modify: `README.md` (multi-workspace subsection under the web-setup section)

- [ ] **Step 1: Document multi-workspace in the README**

In `README.md`, immediately after the "Web setup wizard (M4a)" section's deploy-note blockquote, add:

```markdown
### Multiple workspaces (M5)

One hub can serve **several independent workspaces** — each with its own name, bundle,
search index, ingestion token, and URLs:

- Browser: `/w/<slug>` (default workspace also at `/`)
- REST: `/w/<slug>/api/v1/…` · MCP: `/w/<slug>/api/mcp`
- Legacy URLs (`/api/v1/*`, `/api/mcp`) keep serving the **default** workspace, so
  existing agents keep working unchanged.

Admins manage workspaces in **Settings** (`/setup`): add a workspace (its token and
per-workspace `claude mcp add …` command are shown once), rename (display name only —
slugs are permanent), change bundle, rotate its token, set the default, or delete it
(the last workspace cannot be deleted; bundle files on disk are kept). Tokens are
workspace-scoped: workspace A's token gets `401` on workspace B's endpoints.
`OKF_INGEST_TOKEN` (env) still overrides everything hub-wide, and `OKF_BUNDLE_DIR`
overrides the default workspace's bundle.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: full suite green; typecheck clean; build compiles all routes including `/w/[ws]/api/v1/*` and `/w/[ws]/api/[transport]`.

- [ ] **Step 3: Controller runtime smoke (required before merge — do NOT skip; MCP mounts have failed at runtime with green builds before)**

```bash
npm run build
rm -rf /tmp/okf-m5-smoke && OKF_CONFIG_DIR=/tmp/okf-m5-smoke PORT=3000 npm start
```

In another shell / the browser:
1. Complete the first-run wizard (workspace "Alpha", example bundle, password ≥ 8 chars). Note its token `TA`; the completion command must reference `/w/alpha/api/mcp`.
2. Log into `/setup` as admin → **Add a workspace** "Beta" with a **local** bundle: first `mkdir -p /tmp/okf-beta && printf -- '---\ntype: index\ntitle: BetaHome\n---\nbeta\n' > /tmp/okf-beta/index.md`, use path `/tmp/okf-beta`. Note its token `TB` and that its command references `/w/beta/api/mcp`.
3. REST isolation:
   - `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/w/alpha/api/v1/work -H "Authorization: Bearer $TA" -H 'content-type: application/json' -d '{"title":"a","summary":"s","actor":"me"}'` → `201`
   - same against `/w/beta/...` with `TA` → `401`; with `TB` → `201`
   - `curl -s localhost:3000/w/beta/api/v1/search?q=beta` → hits from the beta bundle only
   - unknown slug: `curl -s -o /dev/null -w '%{http_code}' localhost:3000/w/nope/api/v1/search?q=x` → `404`
4. MCP per workspace:
   - `curl -s -X POST localhost:3000/w/alpha/api/mcp -H "Authorization: Bearer $TA" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → 5 tools
   - same for `/w/beta/api/mcp` with `TB` → 5 tools; with `TA` → 401
   - legacy `curl -s -X POST localhost:3000/api/mcp -H "Authorization: Bearer $TA" …tools/list` → 5 tools (default workspace = alpha)
5. Settings: rotate Beta's token → old `TB` now 401 on `/w/beta/...`, new one 201. Make Beta default → legacy `/api/v1/work` GET now lists Beta's records. Delete Beta (confirm) → `/w/beta/...` → 404, default reassigned to alpha, list shows one workspace.
6. Stop the server; `git status` clean (smoke config under /tmp; if any WorkRecords landed in `bundles/example/work/`, delete them: only Beta used a /tmp bundle, Alpha's example-bundle records must be removed with `rm -rf bundles/example/work`).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): multiple workspaces — per-workspace URLs, tokens, management

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final Verification (before finishing the branch)

- [ ] `npm test` — full suite green (existing + config-v2/migration/registry/auth-matrix/workspace-api/mcp-factory/add-workspace/workspace-delete cases).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build` — all routes compile (legacy + `/w/[ws]` API + MCP mounts).
- [ ] Task 8 runtime smoke passed end-to-end (two workspaces, token isolation, per-workspace MCP, legacy = default, rotate/default/delete flows) and the working tree is clean.
- [ ] Then use superpowers:finishing-a-development-branch (push `feat/m5-workspaces`, PR against `main` — note PR #2 may still be open; this PR stacks on it).
