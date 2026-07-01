# OKF Hub — WorkRecord Org-Memory (M3) Design

**Status:** Approved (2026-07-01)
**Supersedes:** the generic "M3 (MCP/REST + sync + Docker/CI)" milestone. Git sync,
Docker, and CI move to a later M4.

## 1. Purpose

Evolve OKF Hub from a team knowledge hub (documenting data assets) into an
**organization-wide work-record memory for AI agents**. Every completed unit of
work is recorded as an OKF `WorkRecord` concept. AI agents (Claude Code, CI, scripts)
both **write** work records into the memory (`emit`) and **read** them back as org
context (`query`), via **MCP** (primary) and a **REST** mirror. This is OKF's native
purpose — a git-backed store of linked Markdown concepts serving as context for
agents — applied to organizational activity.

### Decisions locked during brainstorming
- **Primary goal:** AI-agent org memory (agents query recorded work as context).
- **Capture:** agents/tools auto-emit WorkRecords via an ingestion API/MCP tool; the
  same memory is queried back by agents.
- **Unit:** one WorkRecord = one completed task/session (actor, project, summary,
  artifact links, related-concept links, timestamp).
- **First slice (this milestone):** the write→read loop, single org — schema +
  ingestion (MCP tool + REST POST, token-gated) + agent read (MCP/REST: search,
  recent-work, get, graph) + a `/work` timeline web view.

### Explicitly deferred (roadmap, not this milestone)
- Multi-team / auth / tenancy (D).
- Real auto-emitters: Claude Code session-end hook/skill, git/CI hooks that fan
  `relay` / `obsidian-daily-logger` output out to OKF Hub (E). *(The MCP `okf_record_work`
  tool is itself a minimal emitter Claude can call, so the loop is demonstrable now.)*
- Promoting `actor`/`project` from frontmatter strings to first-class OKF concepts.
- Read-path authentication (reads are open in the MVP; self-host trust assumption).
- Git sync, Docker packaging, CI (carried over from the old M3 → M4).

## 2. Context & Reuse

The MVP builds on the existing, merged codebase and reuses it heavily:

| Existing unit | Reused for |
|---|---|
| OKF bundle (git repo of `.md`) | WorkRecords are ordinary OKF concepts stored under `work/` |
| `lib/okf-core/*` (parse/validate/links/render) | WorkRecord validation + **rehype-sanitize** rendering |
| `lib/edit-ops.ts` `saveContent(dir,path,content,knownPaths)` | validates (error-gated) then writes — reused verbatim for ingestion |
| `lib/bundle-io.ts` `resolveBundlePath` / `writeConceptSource` | path-traversal safety; WorkRecords confined to `.md` under the bundle |
| `lib/db/queries.ts` `searchConcepts` / `graphNeighborhood` / `getConcept` | agent search / graph / get |
| `lib/okf-service.ts` `OkfService` | in-memory SQLite index over the bundle |
| `app/lib/service.ts` `getService()` / `resetService()` | server-only singleton; re-index after a write |
| `app/lib/data.ts` view-models, Blueprint UI, `app/components/nav.tsx` | `/work` timeline view |

**No changes** are needed to `okf-core` validation: a WorkRecord's frontmatter has
`type: WorkRecord` (satisfies the required-`type` rule), `tags` as a list, and an ISO
`timestamp`; `artifacts` is an extra field validators ignore.

## 3. WorkRecord Schema

A WorkRecord is a normal OKF concept file (`type: WorkRecord`) stored under `work/`.

```yaml
---
type: WorkRecord
title: Add rehype-sanitize to render path
actor: jungsup            # who did the work (handle or email)
project: team-okf-hub      # project / repo the work belongs to
timestamp: 2026-07-01T14:23:05Z   # ISO-8601 completion time
tags: [security, feature]
artifacts:                 # links to PRs / commits / docs (0..n)
  - https://github.com/josephleee/team-okf-hub/pull/12
---

Hardened the Markdown render path against stored XSS by inserting
rehype-sanitize before stringify.

## Related
- [render](lib/okf-core/render.md)
```

- **Path:** `work/<project>/<YYYY-MM-DD>-<HHMMSS>-<slug>.md`.
  - `<project>` and `<slug>` are slugified (lowercase; non-`[a-z0-9]` → `-`; collapse
    repeats; trim leading/trailing `-`; slug capped at 60 chars).
  - `<slug>` derives from `title`.
  - date/time derive from `timestamp` (UTC). The `HHMMSS` component makes same-day,
    same-title records collision-free and keeps them sortable.
  - `project` defaults to `general` when omitted.
- **Body:** the free-text `summary` (Markdown). If `links` are supplied, a trailing
  `## Related` section is appended with one Markdown link per path (these become
  graph edges via the existing link/backlink system).
- `actor`, `project`, `artifacts` are frontmatter values (strings / list) — not yet
  concepts. Body links to knowledge concepts (`[orders](tables/orders.md)`) wire the
  work↔knowledge graph through the existing machinery.

### WorkRecordInput (the ingestion payload)

```ts
interface WorkRecordInput {
  title: string;       // required — one-line summary
  summary: string;     // required — Markdown body
  actor: string;       // required — who did the work
  project?: string;    // default "general"
  timestamp?: string;  // ISO-8601; server fills with now() if absent
  tags?: string[];     // default []
  artifacts?: string[];// default [] — URLs
  links?: string[];    // default [] — OKF concept paths to link in "## Related"
}
```

## 4. Architecture

Three layers, transport-agnostic core with thin adapters:

```
                 ┌───────────── MCP client (Claude Code) ─────────────┐
                 │                                                     │
 REST client ──► app/api/v1/*  ─┐                       ┌─► app/api/mcp/route.ts (MCP)
 (CI, curl)                     │                       │
                                ▼                       ▼
                         app/lib/work-api.ts  (server-only shared surface)
                                │  recordWork / recentWork / searchMemory / getConcept / graph
                                ▼
        getService()/resetService()  +  lib/work-record.ts  +  lib/edit-ops.saveContent
                                │
                                ▼
                     bundle (work/*.md, git)  ⇄  in-memory SQLite index
```

- **`lib/work-record.ts`** (pure, no I/O): `buildWorkRecordSource(input, now) →
  { path, content }`. Turns a `WorkRecordInput` into a file path + OKF Markdown string.
  Also exports `slugify(s)`. Pure ⇒ node-unit-testable, deterministic given `now`.
- **`lib/db/queries.ts`**: add `recentWork(db, filter) → WorkRow[]`.
- **`lib/okf-service.ts`**: add `recentWork(filter)` to `OkfService`, wired to the query.
- **`app/lib/work-api.ts`** (`import 'server-only'`): the shared surface both adapters
  call. Wraps `getService()` (read) and, for writes, builds the source via
  `work-record`, saves via `edit-ops.saveContent(bundleDir, path, content, knownPaths)`,
  and calls `resetService()` so the next read sees it. Exposes:
  - `recordWork(input): Promise<{ ok: boolean; path: string; issues: ValidationIssue[] }>`
  - `recentWork(filter): Promise<WorkRow[]>`
  - `searchMemory(query): Promise<SearchHit[]>`
  - `getConceptFull(path): Promise<ConceptRow | undefined>`
  - `graph(path, depth?): Promise<GraphData>`
- **`app/api/v1/*`**: REST adapters (thin) calling `work-api`. Writes are token-gated.
- **`app/api/mcp/route.ts`**: MCP adapter exposing the same operations as MCP tools.
- **`app/work/*` + component**: the `/work` timeline view over `work-api.recentWork`.

`bundleDir` resolves as elsewhere: `process.env.OKF_BUNDLE_DIR ?? 'bundles/example'`.

## 5. Ingestion (Write Path)

Both transports converge on `work-api.recordWork(input)`:
1. `buildWorkRecordSource(input, now)` → `{ path, content }` (path under `work/`).
2. `saveContent(bundleDir, path, content, knownPaths)` — validates with okf-core;
   **writes only if there is no error-severity issue**; body HTML is rendered through
   **rehype-sanitize** (agent input is untrusted). Path safety enforced by
   `resolveBundlePath` (must stay under the bundle, must be `.md`).
3. On success, `resetService()` re-indexes so reads reflect the new record.
4. Returns `{ ok, path, issues }`. On validation failure `ok:false` with the issues
   (HTTP 422 / MCP error text).

## 6. Agent Read (MCP + REST)

### MCP server — `app/api/mcp/route.ts` (primary interface)
- Implemented with **`mcp-handler`** (Next.js-native wrapper over
  `@modelcontextprotocol/sdk`) + **`zod`** tool schemas. `export const runtime = 'nodejs'`
  (better-sqlite3 requires Node). Handler exported as `GET`/`POST`.
- Registered as an MCP server in Claude Code (`claude mcp add --transport http okf-hub
  http://localhost:3000/api/mcp --header "Authorization: Bearer $OKF_INGEST_TOKEN"`),
  making every tool available in-session.
- **Tools:**
  | Tool | Input | Action |
  |---|---|---|
  | `okf_record_work` | `{title, summary, actor, project?, tags?, artifacts?, links?}` | write a WorkRecord (→ `recordWork`) |
  | `okf_recent_work` | `{project?, actor?, limit?}` | list recent WorkRecords |
  | `okf_search` | `{query}` | full-text search across the memory |
  | `okf_get` | `{path}` | full content of one concept/WorkRecord |
  | `okf_graph` | `{path, depth?}` | graph neighborhood of a concept |
- Because the endpoint exposes a write tool, the **whole `/api/mcp` endpoint requires**
  the bearer token (see §7).

### REST mirror — `app/api/v1/*` (for non-MCP producers)
| Route | Method | Auth | Maps to |
|---|---|---|---|
| `/api/v1/work` | `POST` | Bearer | `recordWork(body)` → 201 `{path}` / 422 `{issues}` |
| `/api/v1/work?project=&actor=&limit=` | `GET` | open | `recentWork(filter)` |
| `/api/v1/search?q=` | `GET` | open | `searchMemory(q)` |
| `/api/v1/concept?path=` | `GET` | open | `getConceptFull(path)` (query param, not a catch-all segment) |
| `/api/v1/graph?path=&depth=` | `GET` | open | `graph(path, depth)` |

All routes `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
`/api/v1/concept` uses a `?path=` query param (not a `[...path]` segment) to sidestep
the "catch-all must be last" runtime trap learned in M2a.

## 7. Security

- **Write auth:** ingestion (REST `POST /api/v1/work` and the entire `/api/mcp`
  endpoint) requires `Authorization: Bearer <OKF_INGEST_TOKEN>`. If `OKF_INGEST_TOKEN`
  is **unset**, ingestion is refused with HTTP 503 / an MCP error ("ingestion not
  configured; set OKF_INGEST_TOKEN") — a secure default that requires explicit opt-in.
  Comparison is constant-time-ish (length check + per-char) to avoid trivial timing
  leaks; a plain equality check is acceptable for the MVP.
- **Untrusted input:** WorkRecord bodies are rendered through **rehype-sanitize** (same
  as M2a). Agent-supplied content cannot inject script/HTML into the read path.
- **Path confinement:** `resolveBundlePath` guarantees every WorkRecord write lands on
  a `.md` file under the bundle; the computed `work/<project>/…` path is additionally
  slugified so `project`/`title` cannot contain `../` or separators.
- **Reads are open** in the MVP (self-host trust). Read auth is a later hardening item.

## 8. Web View — `/work`

- `app/work/page.tsx` (`force-dynamic`): reads `work-api.recentWork({project?, actor?})`
  from `?project=`/`?actor=` search params (coerced `string|string[]` as in
  `app/search/page.tsx`), passes a `workView` view-model to a presentational component.
- `app/lib/data.ts` `workView(rows, filter)`: groups rows by `timestamp` date (desc),
  each item carrying `{path, title, actor, project, timestamp, tags, artifacts}`.
- `app/components/work-timeline.tsx` (presentational, RTL-testable): renders date
  groups; each record shows title (→ concept page link), actor, project, tags, and
  artifact links; header offers actor/project filter state. Blueprint Grid styling,
  reusing existing tokens/components.
- `app/components/nav.tsx`: add a **"Work"** link to `/work`.

## 9. Data Layer Additions

`lib/db/queries.ts`:

```ts
export interface WorkRow {
  path: string;
  title: string | null;
  actor: string | null;
  project: string | null;
  timestamp: string | null;
  tags: string[];
  artifacts: string[];
}

export function recentWork(
  db: DB,
  filter: { project?: string; actor?: string; limit?: number } = {},
): WorkRow[];
```

SQL selects `type = 'WorkRecord'`, filtering `project`/`actor` via
`json_extract(frontmatter_json, '$.project' | '$.actor')`, `ORDER BY timestamp DESC`,
`LIMIT` (default 50). `tags`/`artifacts` are parsed from `frontmatter_json` in JS
(default to `[]`).

## 10. Testing Strategy

- **Node unit** (Vitest): `buildWorkRecordSource` (path/slug/frontmatter/body/`## Related`,
  default project, deterministic `now`); `slugify` edge cases; `recentWork` query
  (project/actor filter, desc order, limit, tags/artifacts parse); `workView` grouping.
- **work-api** (Vitest, temp bundle dir): `recordWork` validates + writes a file under
  `work/` and returns its path; re-index makes it visible to `recentWork`; a body with
  a `type`-less/invalid payload returns `ok:false` with issues and writes nothing.
- **Component** (RTL/jsdom): `work-timeline` renders groups, actor/project/artifacts,
  and links.
- **REST route handlers** (Vitest): import the handler functions and invoke with a
  `Request`; assert `POST /api/v1/work` returns 401 without a token, 503 when the env
  token is unset, 201 with a valid token+body, 422 on invalid content; `GET` routes
  return the expected shapes.
- **Controller smoke (required before merge):** run the dev server with
  `OKF_INGEST_TOKEN` set; `curl` `POST /api/v1/work` → 201; `GET /api/v1/work` includes
  it; the `/work` page renders it; call `okf_record_work` + `okf_recent_work` through
  the MCP endpoint (or verify the endpoint responds to an MCP `initialize`/`tools/list`
  handshake). **Browser route-smoke every new route** (`/work`, `/api/v1/*`, `/api/mcp`)
  — build + unit tests did not catch the M2a catch-all 500; only a runtime smoke did.

## 11. Dependencies

Add: `@modelcontextprotocol/sdk`, `mcp-handler`, `zod`. No other new runtime deps.

## 12. Implementation Outline (for the plan)

1. `lib/work-record.ts` — `slugify` + `buildWorkRecordSource` (pure, tested).
2. `lib/db/queries.ts` — `WorkRow` + `recentWork` (tested).
3. `lib/okf-service.ts` — add `recentWork` to `OkfService` + wiring.
4. `app/lib/work-api.ts` (server-only) — `recordWork` / `recentWork` / `searchMemory` /
   `getConceptFull` / `graph`.
5. `app/api/v1/*` — REST routes (search, work GET, work POST + token, concept, graph),
   tested via handler invocation.
6. `app/api/mcp/route.ts` — MCP handler (mcp-handler + zod + token), controller smoke.
7. `app/lib/data.ts` `workView` + `app/work/page.tsx` + `app/components/work-timeline.tsx`
   + nav "Work" link — RTL + route smoke.
8. Docs + sample: README "Org memory (WorkRecords)" section (MCP registration, REST
   examples, `OKF_INGEST_TOKEN`); add one example WorkRecord under
   `bundles/example/work/` so `/work` is non-empty on first run.

## 13. Success Criteria

- An agent (or `curl`) can POST a completed task; it becomes a `work/<…>.md` OKF
  concept, validated and sanitized, visible in `/work` and via `okf_recent_work` /
  `GET /api/v1/work`, and searchable/graph-linked through the existing engine.
- The same MCP endpoint serves both writing (`okf_record_work`) and reading
  (`okf_recent_work`/`okf_search`/`okf_get`/`okf_graph`) — the full org-memory
  write→read loop — with writes token-gated and bodies sanitized.
