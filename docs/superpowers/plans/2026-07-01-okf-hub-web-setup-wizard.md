# Web Setup Wizard (M4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person configure a fresh OKF Hub install entirely in the browser via a `/setup` wizard (choose bundle, generate ingestion token, set an admin password), persisted to a config file, with env vars still overriding.

**Architecture:** A new `lib/config.ts` file-backed config store (env → file → default precedence) becomes the single source of truth that `getService()`, `bundleDir()`, and `checkIngestAuth()` read through. `lib/secrets.ts` holds crypto (token hash, scrypt password, HMAC session). `lib/bundle-source.ts` validates a local path or safely clones a public git URL. A `/setup` route renders a first-run wizard, an admin login, or a settings view depending on `setupState()`; server actions in `app/lib/setup-actions.ts` do the work, gated by an admin session cookie.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript ESM, Node built-ins `node:crypto` + `node:child_process` (no new deps), Vitest (+ jsdom for components).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-01-okf-hub-web-setup-wizard-design.md`.
- **Config file:** `${OKF_CONFIG_DIR ?? '.okf-hub'}/config.json`. Create dir mode `0700`, file mode `0600`.
- **Precedence (per field): env → file → default.** Bundle dir: `OKF_BUNDLE_DIR` → `config.bundle.path` → `'bundles/example'`. Ingest token: `OKF_INGEST_TOKEN` (raw compare) → `config.ingestTokenHash` (sha256 compare) → 503.
- **Secrets at rest:** ingestion token stored as **sha256 hex** (shown once at generation); admin password stored as `scrypt$<saltHex>$<hashHex>`. Never persist plaintext.
- **Token generation:** `crypto.randomBytes(24).toString('base64url')`.
- **Admin session:** httpOnly, `SameSite=Lax`, `Secure` when the request is https, cookie name `okf_admin`, value `HMAC-SHA256(String(expMs), sessionSecret)` formatted `<expMs>.<macHex>`, TTL 12h.
- **git clone safety:** accept only `https://` URLs with no whitespace/shell metacharacters; run with `execFileSync('git', ['clone','--depth','1',url,dest])` (argument array, **never a shell string**); timeout 60000ms; destination confined to `${configDir}/bundles/<slug>`.
- **No new runtime dependencies.** Use `node:crypto` and `node:child_process`.
- **Backward compatibility:** the existing env-var flow (and all current tests) must keep working unchanged — env always wins.
- **ESM imports:** no file extensions; `strict` + `noUncheckedIndexedAccess`. Route handlers set `runtime='nodejs'` where they touch fs/crypto.
- **Timestamps/`createdAt`:** stamped by the caller (`new Date().toISOString()`), not inside `lib/config.ts`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/m4a-web-setup` off `main`.
- **Test commands:** `npm test` (all), `npx vitest run <file>` (targeted), `npm run typecheck`, `npm run build`.

---

### Task 1: Crypto helpers (`lib/secrets.ts`)

**Files:**
- Create: `lib/secrets.ts`
- Test: `lib/secrets.test.ts`

**Interfaces:**
- Produces:
  - `generateToken(): string`
  - `hashToken(token: string): string`
  - `verifyToken(input: string, storedHash: string): boolean`
  - `hashPassword(password: string): string`
  - `verifyPassword(input: string, stored: string): boolean`
  - `randomSecret(): string`
  - `signSession(expMs: number, secret: string): string`
  - `verifySession(cookie: string | undefined, secret: string, nowMs: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/secrets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  generateToken, hashToken, verifyToken,
  hashPassword, verifyPassword, randomSecret,
  signSession, verifySession,
} from './secrets';

describe('token', () => {
  it('generates distinct tokens and verifies by hash', () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThan(20);
    const h = hashToken(t1);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyToken(t1, h)).toBe(true);
    expect(verifyToken(t2, h)).toBe(false);
    expect(verifyToken('', h)).toBe(false);
  });
});

describe('password', () => {
  it('hashes with scrypt and verifies', () => {
    const stored = hashPassword('correct horse');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });
  it('produces a different salt each time', () => {
    expect(hashPassword('x')).not.toBe(hashPassword('x'));
  });
});

describe('session', () => {
  const secret = randomSecret();
  it('signs and verifies within TTL', () => {
    const cookie = signSession(1000, secret);
    expect(verifySession(cookie, secret, 500)).toBe(true);
  });
  it('rejects expired, tampered, wrong-secret, and missing', () => {
    const cookie = signSession(1000, secret);
    expect(verifySession(cookie, secret, 1001)).toBe(false); // expired
    expect(verifySession(cookie + 'x', secret, 500)).toBe(false); // tampered
    expect(verifySession(cookie, randomSecret(), 500)).toBe(false); // wrong secret
    expect(verifySession(undefined, secret, 500)).toBe(false);
    expect(verifySession('garbage', secret, 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/secrets.ts`:

```ts
import { randomBytes, createHash, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function verifyToken(input: string, storedHash: string): boolean {
  if (!input || !storedHash) return false;
  return safeEqualHex(hashToken(input), storedHash);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(input: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = parts[1]!;
  const expected = parts[2]!;
  const actual = scryptSync(input, salt, 32).toString('hex');
  return safeEqualHex(actual, expected);
}

export function randomSecret(): string {
  return randomBytes(32).toString('hex');
}

export function signSession(expMs: number, secret: string): string {
  const payload = String(expMs);
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

export function verifySession(cookie: string | undefined, secret: string, nowMs: number): boolean {
  if (!cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  const mac = cookie.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (!safeEqualHex(mac, expected)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > nowMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/secrets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/secrets.ts lib/secrets.test.ts
git commit -m "feat(secrets): token/password/session crypto helpers (node:crypto)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Config store (`lib/config.ts`)

**Files:**
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Produces:
  - `interface BundleConfig { source: 'example' | 'local' | 'git'; path: string; gitUrl?: string }`
  - `interface OkfConfig { version: 1; workspaceName: string; bundle: BundleConfig; ingestTokenHash: string; adminPasswordHash: string; sessionSecret: string; setupComplete: boolean; createdAt: string }`
  - `configDir(): string`
  - `readConfig(): OkfConfig | null`
  - `writeConfig(config: OkfConfig): void`
  - `resolveBundleDir(): string`
  - `setupState(): 'env-configured' | 'file-configured' | 'first-run'`
  - `invalidateConfigCache(): void`

- [ ] **Step 1: Write the failing test**

Create `lib/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/config.test.ts`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/config.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat(config): file-backed config store with env>file>default precedence

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Refactor `checkIngestAuth` to env → config-hash → 503

**Files:**
- Modify: `lib/ingest-auth.ts`
- Test: `lib/ingest-auth.test.ts`

**Interfaces:**
- Consumes: `readConfig` (Task 2), `verifyToken` (Task 1).
- Produces: unchanged `checkIngestAuth(header: string | null): AuthResult`.

- [ ] **Step 1: Update the test**

Replace `lib/ingest-auth.test.ts` with:

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
  version: 1, workspaceName: 'W', bundle: { source: 'example', path: 'bundles/example' },
  ingestTokenHash: tokenHash, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
  setupComplete: true, createdAt: '2026-07-01T00:00:00Z',
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
  it('config hash: verifies a token against the stored sha256', () => {
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest-auth.test.ts`
Expected: FAIL — config-hash path not implemented (and message/logic differs).

- [ ] **Step 3: Rewrite the implementation**

Replace `lib/ingest-auth.ts` with:

```ts
import { readConfig } from './config';
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
  const cfg = readConfig();
  if (cfg?.ingestTokenHash) {
    return token && verifyToken(token, cfg.ingestTokenHash)
      ? { ok: true }
      : { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: false, status: 503, message: 'ingestion not configured; run /setup or set OKF_INGEST_TOKEN' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest-auth.test.ts && npx vitest run app/api/v1/routes.test.ts`
Expected: PASS (ingest-auth tests pass; the M3 route tests still pass — they set `OKF_INGEST_TOKEN` env for the 401/201 cases and rely on 503 when it is unset with no config in cwd).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest-auth.ts lib/ingest-auth.test.ts
git commit -m "feat(auth): verify ingest token against config hash (env still wins)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Route the running service through `resolveBundleDir()`

**Files:**
- Modify: `app/lib/service.ts`, `app/lib/work-api.ts`, `app/lib/actions.ts`
- Test: `app/lib/service-config.test.ts`

**Interfaces:**
- Consumes: `resolveBundleDir` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `app/lib/service-config.test.ts`:

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/service-config.test.ts`
Expected: FAIL — `getService()` still reads `process.env.OKF_BUNDLE_DIR` directly (returns default `bundles/example`, no `only.md`).

- [ ] **Step 3: Make the edits**

In `app/lib/service.ts`, change the import and the `createService` call:

```ts
import 'server-only';
import { createService, type OkfService } from '../../lib/okf-service';
import { resolveBundleDir } from '../../lib/config';

const cache = globalThis as unknown as { __okfService?: Promise<OkfService> };

export function getService(): Promise<OkfService> {
  if (!cache.__okfService) {
    cache.__okfService = createService(resolveBundleDir());
  }
  return cache.__okfService;
}
```
(Leave `resetService` unchanged.)

In `app/lib/work-api.ts`, replace the `bundleDir` lambda:

```ts
import { resolveBundleDir } from '../../lib/config';
// ...
const bundleDir = () => resolveBundleDir();
```

In `app/lib/actions.ts`, replace the `bundleDir` lambda the same way:

```ts
import { resolveBundleDir } from '../../lib/config';
// ...
const bundleDir = () => resolveBundleDir();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/service-config.test.ts && npm test`
Expected: the new test passes; the FULL suite stays green (existing tests set `OKF_BUNDLE_DIR`, which still wins via `resolveBundleDir`).

- [ ] **Step 5: Commit**

```bash
git add app/lib/service.ts app/lib/work-api.ts app/lib/actions.ts app/lib/service-config.test.ts
git commit -m "refactor(service): resolve bundle dir through config (env still wins)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bundle source validation + safe git clone (`lib/bundle-source.ts`)

**Files:**
- Create: `lib/bundle-source.ts`
- Test: `lib/bundle-source.test.ts`

**Interfaces:**
- Consumes: `configDir` (Task 2).
- Produces:
  - `type SourceResult = { ok: true; path: string } | { ok: false; error: string }`
  - `type ExecFn = (file: string, args: string[]) => void`
  - `validateGitUrl(url: string): { ok: true } | { ok: false; error: string }`
  - `validateLocalPath(path: string): SourceResult`
  - `cloneGitBundle(url: string, opts?: { run?: ExecFn; destRoot?: string }): SourceResult`

- [ ] **Step 1: Write the failing test**

Create `lib/bundle-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateGitUrl, validateLocalPath, cloneGitBundle } from './bundle-source';

describe('validateGitUrl', () => {
  it('accepts https git URLs', () => {
    expect(validateGitUrl('https://github.com/org/repo.git').ok).toBe(true);
  });
  it('rejects non-https and injection attempts', () => {
    expect(validateGitUrl('ssh://git@github.com/o/r.git').ok).toBe(false);
    expect(validateGitUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateGitUrl('git://x/y').ok).toBe(false);
    expect(validateGitUrl('https://x/y ; rm -rf /').ok).toBe(false);
    expect(validateGitUrl('https://x/$(whoami)').ok).toBe(false);
    expect(validateGitUrl('').ok).toBe(false);
  });
});

describe('validateLocalPath', () => {
  it('accepts a dir with a .md file', () => {
    const d = mkdtempSync(join(tmpdir(), 'okf-lp-'));
    writeFileSync(join(d, 'a.md'), '---\ntype: index\n---\nx');
    expect(validateLocalPath(d)).toEqual({ ok: true, path: d });
    rmSync(d, { recursive: true, force: true });
  });
  it('rejects missing, non-dir, and empty dirs', () => {
    expect(validateLocalPath('/no/such/path').ok).toBe(false);
    const d = mkdtempSync(join(tmpdir(), 'okf-lp2-'));
    expect(validateLocalPath(d).ok).toBe(false); // no .md
    rmSync(d, { recursive: true, force: true });
  });
});

describe('cloneGitBundle', () => {
  it('runs git via an argument array (no shell) and validates the clone', () => {
    const root = mkdtempSync(join(tmpdir(), 'okf-clone-'));
    const calls: { file: string; args: string[] }[] = [];
    const run = (file: string, args: string[]) => {
      calls.push({ file, args });
      const dest = args[args.length - 1]!;      // git clone ... <dest>
      mkdirSync(dest, { recursive: true });
      writeFileSync(join(dest, 'index.md'), '---\ntype: index\n---\ncloned');
    };
    const res = cloneGitBundle('https://github.com/org/repo.git', { run, destRoot: root });
    expect(res.ok).toBe(true);
    expect(calls[0]!.file).toBe('git');
    expect(calls[0]!.args.slice(0, 3)).toEqual(['clone', '--depth', '1']);
    expect(calls[0]!.args).toContain('https://github.com/org/repo.git');
    rmSync(root, { recursive: true, force: true });
  });
  it('rejects a bad url before running git', () => {
    let ran = false;
    const res = cloneGitBundle('file:///etc', { run: () => { ran = true; } });
    expect(res.ok).toBe(false);
    expect(ran).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bundle-source.test.ts`
Expected: FAIL — cannot resolve `./bundle-source`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/bundle-source.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config';

export type SourceResult = { ok: true; path: string } | { ok: false; error: string };
export type ExecFn = (file: string, args: string[]) => void;

export function validateGitUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (!/^https:\/\/[^\s]+$/.test(url)) {
    return { ok: false, error: 'only https:// git URLs are allowed' };
  }
  if (/[;&|`$<>()\\'"]/.test(url)) {
    return { ok: false, error: 'URL contains disallowed characters' };
  }
  return { ok: true };
}

export function validateLocalPath(path: string): SourceResult {
  let st;
  try {
    st = statSync(path);
  } catch {
    return { ok: false, error: `path does not exist: ${path}` };
  }
  if (!st.isDirectory()) return { ok: false, error: 'path is not a directory' };
  const hasMd = readdirSync(path).some((n) => n.endsWith('.md'));
  if (!hasMd) return { ok: false, error: 'directory contains no .md files' };
  return { ok: true, path };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bundle';
}

export function cloneGitBundle(url: string, opts: { run?: ExecFn; destRoot?: string } = {}): SourceResult {
  const urlCheck = validateGitUrl(url);
  if (!urlCheck.ok) return urlCheck;
  const destRoot = opts.destRoot ?? join(configDir(), 'bundles');
  const name = slugify(url.replace(/\.git$/, '').split('/').pop() ?? 'bundle');
  const dest = join(destRoot, name);
  const run: ExecFn =
    opts.run ??
    ((file, args) => {
      execFileSync(file, args, { timeout: 60000, stdio: 'ignore' });
    });
  try {
    run('git', ['clone', '--depth', '1', url, dest]);
  } catch (err) {
    return { ok: false, error: `git clone failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return validateLocalPath(dest);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bundle-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/bundle-source.ts lib/bundle-source.test.ts
git commit -m "feat(bundle-source): local-path validation + safe public git clone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Admin session helper (`app/lib/admin-session.ts`)

**Files:**
- Create: `app/lib/admin-session.ts`

**Interfaces:**
- Consumes: `readConfig` (Task 2); `signSession`, `verifySession` (Task 1); `cookies` from `next/headers`.
- Produces (server-only, async):
  - `setAdminSession(secure: boolean): Promise<void>`
  - `isAdmin(): Promise<boolean>`
  - `clearAdminSession(): Promise<void>`

- [ ] **Step 1: Write the implementation (glue verified by the controller smoke)**

This file is thin glue over `next/headers` cookies; its crypto is already unit-tested in Task 1 and its runtime behavior is verified by the Task 9 controller smoke. Create `app/lib/admin-session.ts`:

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { readConfig } from '../../lib/config';
import { signSession, verifySession } from '../../lib/secrets';

const COOKIE = 'okf_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

export async function setAdminSession(secure: boolean): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;
  const value = signSession(Date.now() + TTL_MS, cfg.sessionSecret);
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

export async function isAdmin(): Promise<boolean> {
  const cfg = readConfig();
  if (!cfg) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  return verifySession(value, cfg.sessionSecret, Date.now());
}

export async function clearAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/admin-session.ts
git commit -m "feat(setup): admin session cookie helper (signed, httpOnly, 12h)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Setup server actions (`app/lib/setup-actions.ts`)

**Files:**
- Create: `app/lib/setup-actions.ts`
- Test: `app/lib/setup-actions.test.ts`

**Interfaces:**
- Consumes: `readConfig`/`writeConfig`/`resolveBundleDir`/`setupState`/`invalidateConfigCache` + types (Task 2); `generateToken`/`hashToken`/`hashPassword`/`verifyPassword`/`randomSecret` (Task 1); `validateLocalPath`/`cloneGitBundle` (Task 5); `resetService` (`app/lib/service.ts`); `isAdmin`/`setAdminSession`/`clearAdminSession` (Task 6).
- Produces (`'use server'`):
  - `interface SetupInput { workspaceName: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string; adminPassword: string }`
  - `completeSetup(input: SetupInput): Promise<{ ok: true; token: string; mcpCommand: string } | { ok: false; error: string }>`
  - `adminLogin(password: string): Promise<{ ok: boolean; error?: string }>`
  - `adminLogout(): Promise<void>`
  - `rotateToken(): Promise<{ ok: boolean; token?: string; error?: string }>`
  - `renameWorkspace(name: string): Promise<{ ok: boolean; error?: string }>`
  - `changeBundle(input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string }): Promise<{ ok: boolean; error?: string }>`

**Note for the implementer:** `completeSetup` does not touch cookies, so it is unit-testable directly. `adminLogin`/`rotateToken`/etc. call cookie helpers (request-scoped) and are verified by the Task 9 controller smoke — the unit test here covers `completeSetup` and the admin-gate refusal path.

- [ ] **Step 1: Write the failing test**

Create `app/lib/setup-actions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/setup-actions.test.ts`
Expected: FAIL — cannot resolve `./setup-actions`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/setup-actions.ts`:

```ts
'use server';
import { headers } from 'next/headers';
import {
  readConfig, writeConfig, setupState, type OkfConfig, type BundleConfig,
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

function resolveBundle(input: SetupInput): { ok: true; bundle: BundleConfig } | { ok: false; error: string } {
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

function buildMcpCommand(token: string): string {
  return `claude mcp add --transport http okf-hub http://localhost:3000/api/mcp --header "Authorization: Bearer ${token}"`;
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

  const token = generateToken();
  const config: OkfConfig = {
    version: 1,
    workspaceName: input.workspaceName.trim(),
    bundle: bundle.bundle,
    ingestTokenHash: hashToken(token),
    adminPasswordHash: hashPassword(input.adminPassword),
    sessionSecret: randomSecret(),
    setupComplete: true,
    createdAt: new Date().toISOString(),
  };
  writeConfig(config);
  resetService();
  return { ok: true, token, mcpCommand: buildMcpCommand(token) };
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

export async function rotateToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const token = generateToken();
  writeConfig({ ...cfg, ingestTokenHash: hashToken(token) });
  return { ok: true, token };
}

export async function renameWorkspace(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!name.trim()) return { ok: false, error: 'name is required' };
  writeConfig({ ...cfg, workspaceName: name.trim() });
  return { ok: true };
}

export async function changeBundle(
  input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const bundle = resolveBundle({
    workspaceName: cfg.workspaceName, bundleSource: input.source,
    localPath: input.localPath, gitUrl: input.gitUrl, adminPassword: '',
  });
  if (!bundle.ok) return bundle;
  writeConfig({ ...cfg, bundle: bundle.bundle });
  resetService();
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/setup-actions.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/setup-actions.ts app/lib/setup-actions.test.ts
git commit -m "feat(setup): setup + admin server actions (completeSetup, login, rotate, rename)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Setup UI (`app/setup/page.tsx` + wizard component)

**Files:**
- Create: `app/setup/page.tsx`, `app/components/setup-wizard.tsx`
- Test: `app/components/setup-wizard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `setupState`/`readConfig` (Task 2); `isAdmin` (Task 6); `completeSetup`/`adminLogin`/`rotateToken`/`renameWorkspace`/`adminLogout` (Task 7).
- Produces: `SetupWizard` client component (props: `onComplete: (input: SetupInput) => Promise<{ ok: true; token: string; mcpCommand: string } | { ok: false; error: string }>`).

- [ ] **Step 1: Write the failing test**

Create `app/components/setup-wizard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './setup-wizard';

afterEach(cleanup);

describe('SetupWizard', () => {
  it('submits the form and shows the one-time token + mcp command on success', async () => {
    const onComplete = vi.fn(async () => ({ ok: true as const, token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));
    render(<SetupWizard onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough' }),
    ));
    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy();
    expect(screen.getByText(/claude mcp add/i)).toBeTruthy();
  });

  it('shows the error when setup fails', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'workspace name is required' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/workspace name is required/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/setup-wizard.test.tsx`
Expected: FAIL — cannot resolve `./setup-wizard`.

- [ ] **Step 3: Write the wizard component**

Create `app/components/setup-wizard.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { SetupInput } from '../lib/setup-actions';

type Result = { ok: true; token: string; mcpCommand: string } | { ok: false; error: string };

export function SetupWizard({ onComplete }: { onComplete: (input: SetupInput) => Promise<Result> }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [bundleSource, setBundleSource] = useState<'example' | 'local' | 'git'>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; mcpCommand: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onComplete({ workspaceName, bundleSource, localPath, gitUrl, adminPassword });
      if (res.ok) setDone({ token: res.token, mcpCommand: res.mcpCommand });
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'setup failed');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="okf-setup okf-setup--done">
        <h1>Setup complete ✓</h1>
        <p className="okf-setup__warn">Copy your ingestion token now — it will not be shown again.</p>
        <pre className="okf-setup__token"><code>{done.token}</code></pre>
        <h2>Connect an agent (MCP)</h2>
        <pre><code>{done.mcpCommand}</code></pre>
        <p><a href="/">Go to the hub →</a> · <a href="/work">Work timeline →</a></p>
      </section>
    );
  }

  return (
    <form className="okf-setup" onSubmit={submit}>
      <h1>Welcome to OKF Hub</h1>
      <p className="okf-setup__lede">Configure this instance. Nothing is saved until you finish.</p>

      <label>Workspace name
        <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Data" />
      </label>

      <fieldset className="okf-setup__bundle">
        <legend>Bundle source</legend>
        <label><input type="radio" name="src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
        <label><input type="radio" name="src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
        {bundleSource === 'local' && (
          <input aria-label="local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
        )}
        <label><input type="radio" name="src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
        {bundleSource === 'git' && (
          <input aria-label="git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
        )}
      </fieldset>

      <label>Admin password
        <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="protects future settings changes" />
      </label>

      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>
    </form>
  );
}
```

- [ ] **Step 4: Write the setup route**

Create `app/setup/page.tsx`:

```tsx
import { setupState, readConfig } from '../../lib/config';
import { isAdmin } from '../lib/admin-session';
import { completeSetup, adminLogin, rotateToken, renameWorkspace, changeBundle } from '../lib/setup-actions';
import { SetupWizard } from '../components/setup-wizard';

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

  // file-configured → require admin
  const admin = await isAdmin();
  const cfg = readConfig();
  if (!admin) {
    return (
      <main className="okf-setup okf-screen">
        <form className="okf-setup" action={async (fd: FormData) => { 'use server'; await adminLogin(String(fd.get('password') ?? '')); }}>
          <h1>Admin login</h1>
          <label>Password <input name="password" type="password" aria-label="admin password" /></label>
          <button type="submit">Log in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="okf-setup okf-screen">
      <h1>Settings — {cfg?.workspaceName}</h1>
      <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await renameWorkspace(String(fd.get('name') ?? '')); }}>
        <label>Workspace name <input name="name" defaultValue={cfg?.workspaceName} /></label>
        <button type="submit">Rename</button>
      </form>
      <form className="okf-setup__row" action={async () => { 'use server'; await rotateToken(); }}>
        <p>Rotate the ingestion token (the old token stops working immediately).</p>
        <button type="submit">Rotate token</button>
      </form>
      <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await changeBundle({ source: String(fd.get('source') ?? 'example') as 'example' | 'local' | 'git', localPath: String(fd.get('localPath') ?? ''), gitUrl: String(fd.get('gitUrl') ?? '') }); }}>
        <label>Bundle source
          <select name="source" defaultValue={cfg?.bundle.source}>
            <option value="example">example</option>
            <option value="local">local path</option>
            <option value="git">git url</option>
          </select>
        </label>
        <input name="localPath" aria-label="settings local path" placeholder="/srv/okf-bundle (for local)" />
        <input name="gitUrl" aria-label="settings git url" placeholder="https://…​ (for git)" />
        <button type="submit">Change bundle</button>
      </form>
      <p className="okf-setup__note">Current bundle: <code>{cfg?.bundle.source}</code> · <code>{cfg?.bundle.path}</code></p>
    </main>
  );
}
```

- [ ] **Step 5: Add styles**

Append to `app/globals.css`:

```css
/* --- Setup wizard --- */
.okf-setup { max-width: 560px; display: flex; flex-direction: column; gap: 14px; }
.okf-setup label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; }
.okf-setup input[type="text"], .okf-setup input:not([type]), .okf-setup input[type="password"] { padding: 8px 10px; border: 1px solid var(--okf-border, #d7deea); border-radius: 8px; font: inherit; }
.okf-setup__bundle { border: 1px solid var(--okf-border, #d7deea); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.okf-setup__bundle legend { font-size: 0.8rem; color: var(--okf-muted, #5b6b82); padding: 0 6px; }
.okf-setup__error { color: #b42318; }
.okf-setup__warn { color: var(--okf-warn, #9a6a1f); font-weight: 600; }
.okf-setup__token { background: var(--okf-ink, #0f2747); color: #e7edf7; padding: 12px; border-radius: 8px; word-break: break-all; }
.okf-setup__row { border-top: 1px dashed var(--okf-border, #d7deea); padding-top: 12px; }
.okf-setup button { align-self: flex-start; padding: 8px 16px; border-radius: 8px; border: 0; background: var(--okf-accent, #2563eb); color: #fff; font-weight: 600; cursor: pointer; }
.okf-setup button:disabled { opacity: .6; cursor: default; }
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run app/components/setup-wizard.test.tsx && npm run typecheck && npm run build`
Expected: component tests PASS; typecheck clean; `next build` compiles `/setup`.

- [ ] **Step 7: Commit**

```bash
git add app/setup/page.tsx app/components/setup-wizard.tsx app/components/setup-wizard.test.tsx app/globals.css
git commit -m "feat(setup): /setup wizard, admin login, and settings views

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: First-run redirect + nav + gitignore, and the full smoke

**Files:**
- Modify: `app/page.tsx`, `app/components/nav.tsx`, `app/components/nav.test.tsx`, `.gitignore`

**Interfaces:**
- Consumes: `setupState`/`readConfig` (Task 2); `redirect` from `next/navigation`.

- [ ] **Step 1: Update the nav test**

Append to `app/components/nav.test.tsx` inside the existing `describe`:

```ts
  it('links to setup/settings', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /settings/i }).getAttribute('href')).toBe('/setup');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/nav.test.tsx`
Expected: FAIL — no Settings link yet.

- [ ] **Step 3: Make the edits**

In `app/components/nav.tsx`, add a Settings link after the Work link (keep the existing brand/search):

```tsx
        <Link href="/work" className="okf-nav__link">Work</Link>
        <Link href="/setup" className="okf-nav__link">Settings</Link>
```

In `app/page.tsx`, redirect first-run visitors to `/setup` (add the import and the guard at the top of the component):

```tsx
import { redirect } from 'next/navigation';
import { setupState } from '../lib/config';
import { getService } from './lib/service';
import { homeView, graphView } from './lib/data';
import { ConceptList } from './components/concept-list';
import { GraphPanel } from './components/graph-panel';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (setupState() === 'first-run') redirect('/setup');
  const svc = await getService();
  // ...rest unchanged...
```

Append to `.gitignore`:

```
.okf-hub/
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/components/nav.test.tsx && npm test`
Expected: nav test passes; full suite green.

- [ ] **Step 5: Controller runtime smoke (required before merge)**

Build, then run from a **clean state** (no `OKF_INGEST_TOKEN`, a scratch `OKF_CONFIG_DIR`, and no `OKF_BUNDLE_DIR` so the wizard picks the bundle):

```bash
npm run build
rm -rf /tmp/okf-setup-smoke && OKF_CONFIG_DIR=/tmp/okf-setup-smoke npm start   # port 3000
```
Verify, in another shell / the browser:
1. `GET /` → 307/redirect to `/setup`; `/setup` renders the wizard (no 500).
2. Complete the wizard (example bundle, workspace "Smoke", a ≥8-char admin password). The result screen shows a token and a `claude mcp add …` command.
3. Grab the shown token `T`; then:
   - `curl -s -X POST localhost:3000/api/v1/work -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{"title":"hi","summary":"x","actor":"me"}'` → `201`.
   - `curl -s -X POST localhost:3000/api/mcp -H "Authorization: Bearer $T" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` → lists the 5 tools.
   - A wrong token → 401; the whole thing was configured with **no env vars**.
4. Reload `/setup` → it now demands the **admin password** (not the wizard). Logging in shows the settings view; **Rotate token** issues a new token and the old `T` now returns 401.
Stop the server. Confirm `git status` is clean (config lives under `/tmp`, and `.okf-hub/` is gitignored anyway).

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/components/nav.tsx app/components/nav.test.tsx .gitignore
git commit -m "feat(setup): first-run redirect to /setup + Settings nav link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (before finishing the branch)

- [ ] `npm test` — full suite green (existing + new secrets/config/ingest-auth/service-config/bundle-source/setup-actions/setup-wizard/nav cases).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build` — all routes compile (including `/setup`).
- [ ] The Task 9 controller smoke passed end-to-end (clean-state web setup → token drives MCP + REST → admin-gated settings → token rotation), and the working tree is clean (`.okf-hub/` gitignored).
- [ ] Then use superpowers:finishing-a-development-branch.
