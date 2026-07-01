# OKF Hub — Web Setup Wizard (M4a) Design

**Status:** Approved (2026-07-01)
**Milestone:** M4a — the first slice of "do all setup in the web." Deployment-artifact
generation (B) and multi-user org accounts (C) are deferred to later milestones.

## 1. Purpose

Today OKF Hub is configured with **environment variables** (`OKF_BUNDLE_DIR`,
`OKF_INGEST_TOKEN`). M4a lets a person configure a fresh install **from the browser**
via a `/setup` onboarding wizard: name the workspace, choose the OKF bundle to serve,
generate the ingestion token, and see the exact MCP/REST connection instructions.
Configuration is **persisted to a file** so no shell/env editing is required, and
later changes (rotate the token, switch bundles, rename) are also done in the web,
behind an admin gate.

This is the app's **first persistent config and first authentication surface** — the
design is deliberately explicit about where secrets live and how the setup surface is
protected.

### Decisions locked during brainstorming
- **Scope:** first-run setup wizard (option A). Not the deployment helper (B) or
  multi-user org (C).
- **Bundle sources:** (a) the bundled example, (b) a local directory path on the
  server, (c) **clone a public git URL**. Private-repo clone (PAT/deploy key) is
  deferred.
- **Persistence:** a JSON config file; **environment variables override the file**
  (backward compatible with the current env flow, CI, and tests).
- **Admin model:** the wizard sets an **admin password**; after setup, `/setup` and
  all config mutations require admin login (so ongoing changes stay in the web, but
  are protected — the agent-facing ingestion token is *not* reused as the admin
  secret).

### Explicitly deferred
- Private git clone (credentials entry), git auto re-pull / sync.
- Deployment-artifact generation (Docker Compose, reverse-proxy + auth, env) — B.
- Multi-user accounts / roles / teams, GitHub OAuth login — C (needs M2b).
- Domain/TLS/hosting provisioning (inherently out-of-band; the app cannot self-provision it).

## 2. Config store & precedence

**Location:** `${OKF_CONFIG_DIR ?? '.okf-hub'}/config.json` (directory created on first
write, mode `0700`; file mode `0600`).

**Schema (`config.json`):**
```jsonc
{
  "version": 1,
  "workspaceName": "Acme Data",
  "bundle": { "source": "example" | "local" | "git",
              "path": "/abs/path/or/.okf-hub/bundles/<slug>",  // resolved dir to serve
              "gitUrl": "https://github.com/org/okf-bundle.git" }, // when source==="git"
  "ingestTokenHash": "<sha256 hex of the token>",   // NEVER the plaintext token
  "adminPasswordHash": "scrypt$<saltHex>$<hashHex>",
  "sessionSecret": "<32 random bytes, hex>",         // signs admin session cookies
  "setupComplete": true,
  "createdAt": "<ISO>"                               // stamped by the caller, not the module
}
```
Secrets at rest: the **ingestion token is stored hashed** (shown to the user once, at
generation) and the **admin password is stored scrypt-hashed**. Neither plaintext is
persisted.

**Precedence (per field): env → file → default.**
- Bundle dir: `OKF_BUNDLE_DIR` → `config.bundle.path` → `'bundles/example'`.
- Ingest token: if `OKF_INGEST_TOKEN` is set, use it with a **raw** constant-time
  compare (today's behavior); else if `config.ingestTokenHash` is set, hash the
  incoming bearer (sha256) and constant-time-compare to the stored hash; else refuse
  (503, "ingestion not configured").

## 3. Runtime integration (refactor)

A new **`lib/config.ts`** is the single source of truth. Reads are synchronous
(`readFileSync`) with an in-process cache invalidated on write, so existing sync
callers stay sync.

- `resolveBundleDir(): string` — env → file → default.
- `getService()` (`app/lib/service.ts`) calls `resolveBundleDir()` instead of reading
  `process.env.OKF_BUNDLE_DIR` directly; `bundleDir()` in `app/lib/work-api.ts` and
  `app/lib/actions.ts` do the same (one shared resolver).
- `checkIngestAuth(header)` (`lib/ingest-auth.ts`) is extended to the env-raw →
  file-hash → 503 logic above. The 503/401 result shape is unchanged.
- After any config change that affects the served bundle, the caller invokes the
  existing **`resetService()`** — the next request rebuilds the SQLite index from the
  new bundle. No process restart.

## 4. The wizard (`/setup`, first run)

Multi-step Server-Component flow with a small client stepper; each step submits via a
Server Action in `app/lib/setup-actions.ts`.

1. **Workspace name.**
2. **Bundle source** — pick one:
   - *Example* — serve `bundles/example`.
   - *Local path* — enter an absolute server path; validated: exists, is a directory,
     contains ≥1 `.md`, and `buildBundle` parses it with no error-severity issues.
   - *Clone public git URL* — enter an `https://` git URL; the server runs
     `git clone --depth 1 <url> <dest>` (see §5 safety) into
     `.okf-hub/bundles/<slug>`, then validates it like a local path.
3. **Generate ingestion token** — the server generates a strong token
   (`crypto.randomBytes(24)` → base64url); it is shown **once** with a copy button and
   a "won't be shown again" warning; only its sha256 hash is stored.
4. **Set admin password** — protects future config changes (min length enforced;
   scrypt-hashed).
5. **Done** — show the ready-to-run `claude mcp add --transport http okf-hub
   http://<host>/api/mcp --header "Authorization: Bearer <token>"` command, REST curl
   examples, and links to `/` and `/work`. Write config with `setupComplete: true`.

**After setup:** visiting `/setup` shows an **admin login** (password); on success it
sets a signed session cookie (§5) and reveals a settings view to: switch the bundle
source (re-point/clone + `resetService()`), **rotate** the ingestion token (new token
shown once), and rename the workspace.

## 5. Security model

- **Ingestion token:** hashed at rest, shown once (API-key pattern). Verified by hashing
  the incoming bearer and constant-time-comparing (`crypto.timingSafeEqual`).
- **Admin password:** `crypto.scryptSync` (Node built-in — no new dependency) with a
  per-password random salt; verified with `timingSafeEqual`.
- **Admin session:** after login, an httpOnly, `SameSite=Lax`, `Secure`-when-https
  cookie `okf_admin` carrying `HMAC-SHA256({ exp }, sessionSecret)`; TTL 12h. Every
  config-mutating action verifies signature + expiry before acting.
- **First-run gating:** `setupState()` returns `'env-configured'` (an
  `OKF_INGEST_TOKEN` env is present), `'file-configured'` (`setupComplete === true`),
  or `'first-run'`. The **home page** (`/`) redirects to `/setup` when `'first-run'`
  (fresh operators land on setup); other pages keep working on the resolved/default
  bundle. `/setup` itself and `/api/*` never redirect (no loop). Once configured, the
  wizard endpoints refuse to re-run without an admin session.
- **git clone safety:** only `https://` URLs (reject `ssh://`, `git://`, `file://`,
  shell metacharacters); run with `execFile('git', [...args])` (argument array, **no
  shell**), `--depth 1`, a timeout (e.g. 60s), and a destination confined to
  `.okf-hub/bundles/<slug>` (slugified, refuse if it escapes). A failed/oversized clone
  reports a clean error, not a 500.
- **Local path:** accepted only when it resolves to an existing directory with ≥1
  `.md`; the setup surface that accepts it is admin/first-run gated (the operator runs
  the server and already has filesystem access, so pointing at a path they own is fine).
- **No secret echo:** neither the token nor the admin password is ever returned by a
  read API or embedded in server-rendered HTML after its one-time display.

## 6. Components / files

**New**
- `lib/config.ts` — read/write config, `resolveBundleDir()`, `setupState()`, token +
  password hashing/verify, session sign/verify. Pure logic + a thin fs layer; unit-testable.
- `lib/bundle-source.ts` — `validateLocalPath(path)` and `cloneGitBundle(url)` (safe
  clone), each returning a resolved dir or a typed error.
- `app/setup/page.tsx` (+ step components) — the wizard / admin-login / settings UI.
- `app/components/setup-wizard.tsx` — presentational stepper (RTL-testable).
- `app/lib/setup-actions.ts` (`'use server'`) — `startBundle`, `generateToken`,
  `setAdminPassword`, `completeSetup`, `adminLogin`, `rotateToken`, `changeBundle`,
  `renameWorkspace`; each gated per §5.

**Modified**
- `app/lib/service.ts`, `app/lib/work-api.ts`, `app/lib/actions.ts` — use
  `resolveBundleDir()`.
- `lib/ingest-auth.ts` — env-raw → file-hash → 503 logic.
- `app/page.tsx` — first-run redirect to `/setup`.
- `app/components/nav.tsx` — show the workspace name; a "Settings" link to `/setup`.
- `.gitignore` — ignore `.okf-hub/`.

## 7. Testing

- **Unit (`lib/config.ts`):** precedence (env > file > default) for bundle dir and
  token; token hash verify (correct/incorrect/constant-time); scrypt password
  set/verify; session sign/verify (tamper + expiry); `setupState()` transitions.
- **Unit (`lib/bundle-source.ts`):** local-path validation (missing / not-dir /
  no-`.md` / valid); git-URL validation rejects `ssh`/`file`/metacharacters and accepts
  `https`; clone runs via `execFile` with an argument array (assert no shell string).
- **Actions/routes:** completing setup writes a valid config and flips `setupComplete`;
  post-setup mutations are refused without a valid admin session and accepted with one;
  `checkIngestAuth` accepts a token that matches the stored hash and rejects others.
- **Component (RTL):** the wizard renders each step and the one-time token display; the
  post-setup settings view gates on login.
- **Controller runtime smoke (required before merge):** from a clean state (no env,
  no `.okf-hub`), `/` redirects to `/setup`; complete the wizard (example bundle);
  the generated token drives a successful MCP `tools/list` + `okf_record_work` and a
  REST `POST /api/v1/work`; re-visiting `/setup` demands the admin password; rotating
  the token invalidates the old one. **Browser route-smoke every new route** (M2a lesson).

## 8. Success criteria

A fresh `git clone` + `npm run dev` with **no environment variables** lands the
operator on `/setup`; they choose a bundle, get a token shown once, set an admin
password, and copy a working `claude mcp add …` command — all in the browser. Env-based
configuration continues to work unchanged. The ingestion token and admin password are
never stored in plaintext, and post-setup reconfiguration requires admin login.
