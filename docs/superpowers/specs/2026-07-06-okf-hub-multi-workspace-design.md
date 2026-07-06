# Multi-Workspace (M5) — Design

**Goal:** One OKF Hub instance serves **multiple independent workspaces** — each with its own
name, knowledge bundle, search index, and ingestion token, all live at the same time. People
switch via per-workspace URLs; agents connect to a specific workspace's own MCP/REST endpoint
with that workspace's token. A single hub admin creates and manages workspaces.

**Locked decisions (from brainstorming):**
1. **Independent workspaces** — concurrent serving, per-workspace URL + token + index. No shared
   "active workspace" state that switching would mutate for agents.
2. **Single hub admin** — one admin password/session for the whole hub manages all workspaces.
   Workspaces have no per-workspace admin; they only have their own ingestion token.
3. **Path-prefix routing `/w/<slug>`** — UI at `/w/acme/…`, REST at `/w/acme/api/v1/…`, MCP at
   `/w/acme/api/mcp`. **Legacy URLs (`/`, `/api/v1/*`, `/api/mcp`) keep working against the
   default workspace** — existing agents and links stay valid.

**Delivery split (one spec, two implementation plans):**
- **M5a — workspace core + agent surface:** config v2 + migration, per-workspace service
  registry, per-workspace ingest auth, `/w/[ws]/api/*` REST + MCP, and the hub-admin management
  UI in `/setup` (list / add / rename / change bundle / rotate token / delete / set default).
  After M5a, agents are fully multi-workspace; the browser UI still shows the default workspace.
- **M5b — workspace browser UI:** the `/w/[ws]` page tree (home, concept, search, graph, work,
  edit, new) with workspace-aware links, plus a workspace switcher in the nav.

---

## 1. Config schema v2 + migration

`lib/config.ts` gains a v2 schema. One file, same location (`${OKF_CONFIG_DIR:-.okf-hub}/config.json`,
dir 0700 / file 0600):

```ts
export interface WorkspaceConfig {
  slug: string;            // url-safe id, unique within the hub
  name: string;
  bundle: BundleConfig;    // unchanged shape: { source, path, gitUrl? }
  ingestTokenHash: string; // sha256 hex, per workspace
  createdAt: string;
}

export interface OkfConfigV2 {
  version: 2;
  adminPasswordHash: string;   // hub-wide (unchanged semantics)
  sessionSecret: string;       // hub-wide (unchanged semantics)
  setupComplete: boolean;
  defaultWorkspace: string;    // slug; serves legacy URLs
  workspaces: WorkspaceConfig[]; // length >= 1 once setupComplete
  createdAt: string;
}
```

- **Migration:** `readConfig()` returns v2. If the file on disk is v1, migrate in memory
  (v1 fields → hub fields + a single workspace with `slug = slugify(workspaceName)`,
  `defaultWorkspace = that slug`) and persist the migrated v2 back to disk once.
- **Slug rules:** `slugify` lowercases to `[a-z0-9-]`, trims to 40 chars, falls back to
  `'workspace'`; uniqueness enforced by suffixing `-2`, `-3`, … Slugs are permanent (rename
  changes `name` only, so URLs and agent configs never break).
- **Helper API (new/changed in `lib/config.ts`):**
  - `readConfig(): OkfConfigV2 | null`, `writeConfig(cfg: OkfConfigV2): void` (v2 only)
  - `getWorkspace(slug: string): WorkspaceConfig | null`
  - `defaultWorkspaceSlug(): string | null`
  - `resolveBundleDir(slug?: string): string` — see env precedence below
  - `setupState()` unchanged: `'env-configured' | 'file-configured' | 'first-run'`
- **Env precedence (unchanged spirit — env always wins):**
  - `OKF_INGEST_TOKEN` (raw compare) is accepted on **every** workspace endpoint (hub-wide
    override; preserves all existing tests and agent configs).
  - `OKF_BUNDLE_DIR` overrides the bundle dir of the **default workspace only** (that is the
    workspace legacy URLs serve, which is what the env var meant before).
  - With neither config nor env: `resolveBundleDir()` falls back to `'bundles/example'` as today.

## 2. Service registry (per-workspace index)

`app/lib/service.ts` becomes a registry keyed by slug:

```ts
getService(slug?: string): Promise<OkfService>  // slug defaults to defaultWorkspaceSlug()
resetService(slug?: string): void               // one workspace, or all when omitted
```

Cache is a `Map<slug, Promise<OkfService>>` on `globalThis`. Each entry is
`createService(resolveBundleDir(slug))` — each workspace gets its own SQLite/FTS index built
from its own bundle (createService already isolates per bundle dir). `app/lib/work-api.ts` and
`app/lib/actions.ts` functions gain an optional trailing `slug?: string` parameter and resolve
through the registry; legacy callers omit it.

## 3. Auth

- **Hub admin (unchanged):** one `okf_admin` cookie signed with the hub `sessionSecret`; the
  existing `AdminLogin` + `isAdmin()` flow gates all workspace management.
- **Ingest auth becomes workspace-aware:** `checkIngestAuth(header, slug?)` —
  1. `OKF_INGEST_TOKEN` env set → raw compare, valid for any workspace (env wins).
  2. Else workspace `slug` (or default) exists with `ingestTokenHash` → sha256 verify.
  3. Else 503 (`ingestion not configured`), unchanged message/status.
  A token for workspace A presented to workspace B's endpoint → **401** (isolation).

## 4. Routing

**Legacy (unchanged behavior, now explicitly "default workspace"):** `/`, `/concept/*`,
`/search`, `/graph`, `/work`, `/edit/*`, `/concept/new`, `/api/v1/*`, `/api/[transport]` all
operate on the default workspace. `/setup` stays hub-level.

**New tree:**
```
app/w/[ws]/page.tsx                    (M5b)
app/w/[ws]/concept/[...path]/page.tsx  (M5b)
app/w/[ws]/concept/new/page.tsx        (M5b)
app/w/[ws]/edit/[...path]/page.tsx     (M5b)
app/w/[ws]/search/page.tsx             (M5b)
app/w/[ws]/graph/page.tsx              (M5b)
app/w/[ws]/work/page.tsx               (M5b)
app/w/[ws]/api/v1/{work,search,concept,graph}/route.ts   (M5a)
app/w/[ws]/api/[transport]/route.ts                      (M5a)
```
- Unknown slug → `notFound()` (pages) / 404 JSON (APIs).
- **MCP per-workspace (known risk — runtime-smoke it):** `createMcpHandler`'s `basePath` is
  static per handler instance, so the `/w/[ws]/api/[transport]` route keeps a memoized
  `Map<slug, handler>` and creates each workspace's handler on first request with
  `basePath: '/w/<slug>/api'`. Tool implementations close over the slug (they call the
  work-api functions with it). Lesson from M3 applies: `next build` passing does NOT prove the
  MCP mount works — the final smoke must drive `tools/list` + a record→read loop per workspace.
- Route handlers reuse one shared implementation parameterized by slug; legacy routes call it
  with the default slug (no logic duplication).

## 5. Setup & management UI (hub admin, in `/setup`) — M5a

- **First-run wizard: unchanged flow**, now creating the hub (admin password, session secret)
  plus the **first workspace** (name + bundle → slug, token). Completion screen's mcp command
  points at that workspace: `http://localhost:3000/w/<slug>/api/mcp`.
- **Settings (admin) becomes workspace-centric:**
  - **Workspace list**: name, slug, bundle source/path, "default" badge; per-workspace controls:
    rename (name only), change bundle, rotate token (new token shown once with Copy), delete,
    "make default".
  - **Add workspace**: name + bundle source (same three options + hints as the wizard) → creates
    slug + token; the new token and its `/w/<slug>/api/mcp` mcp-add command are shown **once**
    with Copy buttons.
  - **Delete workspace**: typed-confirmation not required but a confirm prompt is; cannot delete
    the **last** workspace; deleting the default reassigns default to the first remaining
    workspace. Deleting removes it from config and resets its service; **bundle files on disk
    are not deleted** (cloned bundles under `${configDir}/bundles/` are left for manual cleanup —
    the UI says so).
- New/changed server actions in `app/lib/setup-actions.ts` (all admin-gated except
  `completeSetup` first-run):
  `completeSetup` (creates hub + first workspace), `addWorkspace(input)`,
  `renameWorkspace(slug, name)`, `changeBundle(slug, input)`, `rotateToken(slug)`,
  `deleteWorkspace(slug)`, `setDefaultWorkspace(slug)`.

## 6. Workspace switcher + workspace-aware links — M5b

- **Nav switcher:** the nav shows the current workspace name with a dropdown listing all
  workspaces (plain links to `/w/<slug>`) + a "Manage workspaces →" link to `/setup`. On legacy
  paths the current workspace is the default one.
- **Link prefixing:** pages know their slug from `params`; a `base` string (`''` for legacy,
  `/w/<slug>` for workspace routes) is passed to the components/view-models that render hrefs
  (`nav`, `concept-list`, `concept-detail`, `search-results`, `work-timeline`, graph click-through,
  editor form targets). View-model builders in `app/lib/data.ts` accept `base` and emit prefixed
  hrefs so components stay dumb.

## 7. Error handling

- Unknown slug: pages `notFound()`; APIs `{ error: 'unknown workspace' }` 404.
- Add/rename/bundle validation reuses the wizard's rules (name required; bundle via
  `validateLocalPath`/`cloneGitBundle`; password rules unchanged).
- Deleting the last workspace / setting default to a missing slug → refused with message.

## 8. Testing

- **Unit:** config v2 read/write + v1→v2 migration (file rewritten once, fields mapped); slug
  uniqueness/suffixing; `resolveBundleDir(slug)` env-precedence matrix (env overrides default ws
  only); `checkIngestAuth` matrix (env-wins on any ws; per-ws token isolation → cross-ws 401;
  503 unconfigured); registry isolation (two workspaces, two bundles, `getService(a)` ≠
  `getService(b)`, `resetService(a)` leaves b).
- **Route tests:** `/w/<slug>/api/v1/work` 201/401/503 + cross-workspace-token 401; legacy
  `/api/v1/work` still 201 with the default workspace token AND with `OKF_INGEST_TOKEN`.
- **Component tests:** settings workspace list + add-workspace flow (token shown once, mcp
  command contains `/w/<slug>/api/mcp`); delete guards; switcher renders links per workspace.
- **Controller runtime smoke (required before merge, per M3 lesson):** clean state → wizard
  creates ws A → admin adds ws B (different bundle) → A's token drives `/w/a/api/v1/work` 201 +
  `/w/a/api/mcp` tools/list; B's token on A's endpoint → 401; legacy `/api/mcp` with A's (default)
  token works; UI switch A↔B shows different content; delete B → its endpoints 404.

## 9. Compatibility summary

| Existing thing | After M5 |
|---|---|
| v1 `config.json` | auto-migrated to v2 on first read |
| `OKF_INGEST_TOKEN` env | valid on all workspace endpoints (env wins) |
| `OKF_BUNDLE_DIR` env | overrides the default workspace's bundle |
| `/`, `/api/v1/*`, `/api/mcp` | serve the default workspace, unchanged |
| Existing agent mcp configs | keep working (legacy MCP = default ws) |
| All current tests | keep passing (legacy call sites omit `slug`) |

## 10. Branch / process

Branch `feat/m5-workspaces` stacked on `feat/m4a-web-setup` (PR #2 not yet merged; M5 builds on
the setup code). Own PR. Commit trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
Implementation via superpowers:subagent-driven-development, one plan per phase (M5a, then M5b).
