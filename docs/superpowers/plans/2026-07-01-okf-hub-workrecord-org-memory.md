# WorkRecord Org-Memory (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn OKF Hub into an org-wide work-record memory for AI agents: agents emit completed work as OKF `WorkRecord` concepts and query them back via MCP (primary) + a REST mirror, with a `/work` timeline web view.

**Architecture:** A pure builder (`lib/work-record.ts`) turns a structured `WorkRecordInput` into an OKF Markdown file under `work/`. A server-only shared surface (`app/lib/work-api.ts`) reuses M2a's `saveContent` (validate + sanitize + path-safe write) for ingestion and `getService()` for reads; both an MCP route (`app/api/mcp`) and REST routes (`app/api/v1/*`) are thin adapters over it. Writes are token-gated; the `/work` page renders recent records.

**Tech Stack:** Next.js 15 App Router, TypeScript ESM, better-sqlite3 (SQLite/FTS5), gray-matter, `@modelcontextprotocol/sdk` + `mcp-handler` + `zod` (MCP), Vitest (+ jsdom for components).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-01-okf-hub-workrecord-org-memory-design.md`.
- **WorkRecord path format:** `work/<project>/<YYYY-MM-DD>-<HHMMSS>-<slug>.md` (project + slug slugified; project defaults to `general`).
- **WorkRecord frontmatter:** `type: WorkRecord` + `title`, `actor`, `project`, `timestamp` (ISO-8601), `tags` (list), `artifacts` (list of URLs).
- **Reuse, do not re-implement:** ingestion goes through `saveContent(dir, path, content, knownPaths)` from `lib/edit-ops.ts` (error-gated write, rehype-sanitized render) and path safety from `lib/bundle-io.ts`. Reads go through `getService()`/`resetService()` from `app/lib/service.ts`.
- **Write auth:** every ingestion path requires `Authorization: Bearer <OKF_INGEST_TOKEN>`; if `OKF_INGEST_TOKEN` is unset, refuse with HTTP 503 / MCP error. Reads are open.
- **Do NOT modify `bundles/example/`** — four tests assert it has exactly 5 concepts (`lib/okf-core/example-bundle.test.ts`, `lib/okf-service.test.ts`, `app/lib/data.test.ts`). The empty `/work` state + the smoke test cover the demo instead.
- **ESM imports:** no file extensions (`moduleResolution: Bundler`). Relative imports only (no path alias configured).
- **Routes:** every route handler sets `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`. Return Web `Response.json(obj, { status })` (not `next/server`) so handlers are unit-testable in the node env.
- **Catch-all trap:** never place a static segment after a `[...path]` catch-all. `/api/v1/concept` takes `?path=` as a query param, not a path segment.
- **Commit identity:** personal — `Joseph <jungsup@kakao.com>` (already the repo default). End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Test commands:** `npm test` (all), `npx vitest run <file>` (targeted), `npm run typecheck` (tsc --noEmit).
- **Branch:** do all work on a feature branch `feat/m3-workrecord-org-memory` off `main` (currently at `76ff9f6`).

---

### Task 1: WorkRecord source builder (`lib/work-record.ts`)

**Files:**
- Create: `lib/work-record.ts`
- Test: `lib/work-record.test.ts`

**Interfaces:**
- Consumes: `gray-matter` default export (`import matter from 'gray-matter'`; `matter.stringify(body, data)`).
- Produces:
  - `interface WorkRecordInput { title: string; summary: string; actor: string; project?: string; timestamp?: string; tags?: string[]; artifacts?: string[]; links?: string[]; }`
  - `function slugify(s: string): string`
  - `function buildWorkRecordSource(input: WorkRecordInput, now: string): { path: string; content: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/work-record.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { slugify, buildWorkRecordSource } from './work-record';

describe('slugify', () => {
  it('lowercases, replaces non-alnum with dashes, trims', () => {
    expect(slugify('Add rehype-sanitize to render!')).toBe('add-rehype-sanitize-to-render');
  });
  it('collapses repeats and caps length at 60', () => {
    expect(slugify('a'.repeat(80)).length).toBe(60);
    expect(slugify('  --Hello   World--  ')).toBe('hello-world');
  });
});

describe('buildWorkRecordSource', () => {
  const base = { title: 'Add sanitize', summary: 'Hardened render.', actor: 'jungsup' };
  const now = '2026-07-01T14:23:05Z';

  it('computes a path from project, date, time, and slug', () => {
    const { path } = buildWorkRecordSource({ ...base, project: 'team-okf-hub' }, now);
    expect(path).toBe('work/team-okf-hub/2026-07-01-142305-add-sanitize.md');
  });

  it('defaults project to general and uses now when timestamp absent', () => {
    const { path, content } = buildWorkRecordSource(base, now);
    expect(path).toBe('work/general/2026-07-01-142305-add-sanitize.md');
    expect(matter(content).data.timestamp).toBe(now);
  });

  it('emits valid OKF frontmatter (type + list fields)', () => {
    const { content } = buildWorkRecordSource(
      { ...base, tags: ['security'], artifacts: ['https://x/pr/1'] },
      now,
    );
    const { data, content: body } = matter(content);
    expect(data.type).toBe('WorkRecord');
    expect(data.title).toBe('Add sanitize');
    expect(data.actor).toBe('jungsup');
    expect(data.project).toBe('general');
    expect(data.tags).toEqual(['security']);
    expect(data.artifacts).toEqual(['https://x/pr/1']);
    expect(body.trim()).toBe('Hardened render.');
  });

  it('appends a Related section for links', () => {
    const { content } = buildWorkRecordSource({ ...base, links: ['tables/orders.md'] }, now);
    expect(content).toContain('## Related');
    expect(content).toContain('- [tables/orders.md](tables/orders.md)');
  });

  it('defaults tags and artifacts to empty arrays', () => {
    const { content } = buildWorkRecordSource(base, now);
    const { data } = matter(content);
    expect(data.tags).toEqual([]);
    expect(data.artifacts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/work-record.test.ts`
Expected: FAIL — cannot resolve `./work-record`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/work-record.ts`:

```ts
import matter from 'gray-matter';

export interface WorkRecordInput {
  title: string;
  summary: string;
  actor: string;
  project?: string;
  timestamp?: string;
  tags?: string[];
  artifacts?: string[];
  links?: string[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function buildWorkRecordSource(
  input: WorkRecordInput,
  now: string,
): { path: string; content: string } {
  const timestamp = input.timestamp ?? now;
  const project = input.project?.trim() || 'general';
  const projectSlug = slugify(project) || 'general';
  const slug = slugify(input.title) || 'untitled';
  const date = timestamp.slice(0, 10);
  const hhmmss = timestamp.slice(11, 19).replace(/:/g, '') || '000000';
  const path = `work/${projectSlug}/${date}-${hhmmss}-${slug}.md`;

  const data = {
    type: 'WorkRecord',
    title: input.title,
    actor: input.actor,
    project,
    timestamp,
    tags: input.tags ?? [],
    artifacts: input.artifacts ?? [],
  };

  let body = input.summary.trim();
  const links = input.links ?? [];
  if (links.length > 0) {
    body += `\n\n## Related\n${links.map((p) => `- [${p}](${p})`).join('\n')}`;
  }

  return { path, content: matter.stringify(`${body}\n`, data) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/work-record.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/work-record.ts lib/work-record.test.ts
git commit -m "feat(work-record): OKF WorkRecord source builder + slugify

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `recentWork` query (`lib/db/queries.ts`)

**Files:**
- Modify: `lib/db/queries.ts` (append after `graphAll`)
- Test: `lib/db/queries.test.ts` (append)

**Interfaces:**
- Consumes: `DB` type (already imported in queries.ts); the `concepts` table columns `path, type, title, timestamp, frontmatter_json`.
- Produces:
  - `interface WorkRow { path: string; title: string | null; actor: string | null; project: string | null; timestamp: string | null; tags: string[]; artifacts: string[]; }`
  - `function recentWork(db: DB, filter?: { project?: string; actor?: string; limit?: number }): WorkRow[]`

- [ ] **Step 1: Write the failing test**

Two import edits at the **top** of `lib/db/queries.test.ts` (do NOT re-import `Database` — it is already imported there; re-declaring it is a syntax error):
1. Add `recentWork` to the existing `import { ... } from './queries';` line.
2. Add a new line: `import { initSchema } from './schema';`

Then append this `describe` block at the **end** of the file (it builds its own in-memory DB and reuses the already-imported `Database`):

```ts
describe('recentWork', () => {
  function seed() {
    const db = new Database(':memory:');
    initSchema(db);
    const ins = db.prepare(`INSERT INTO concepts
      (path, type, title, description, resource, timestamp, frontmatter_json, body_md, body_html, parse_error)
      VALUES (@path,@type,@title,null,null,@timestamp,@fm,'','',null)`);
    const rec = (path: string, title: string, ts: string, fm: object) =>
      ins.run({ path, type: 'WorkRecord', title, timestamp: ts, fm: JSON.stringify({ type: 'WorkRecord', title, ...fm }) });
    rec('work/a/2026-07-01-090000-first.md', 'First', '2026-07-01T09:00:00Z',
      { actor: 'alice', project: 'proj-a', tags: ['fix'], artifacts: ['https://x/1'] });
    rec('work/b/2026-07-02-090000-second.md', 'Second', '2026-07-02T09:00:00Z',
      { actor: 'bob', project: 'proj-b', tags: [], artifacts: [] });
    rec('work/a/2026-07-03-090000-third.md', 'Third', '2026-07-03T09:00:00Z',
      { actor: 'alice', project: 'proj-a', tags: ['feature'], artifacts: [] });
    // a non-WorkRecord concept that must be excluded
    ins.run({ path: 'tables/orders.md', type: 'table', title: 'Orders', timestamp: '2026-07-04T00:00:00Z',
      fm: JSON.stringify({ type: 'table', actor: 'alice' }) });
    return db;
  }

  it('returns only WorkRecords, newest first', () => {
    const db = seed();
    const rows = recentWork(db);
    expect(rows.map((r) => r.title)).toEqual(['Third', 'Second', 'First']);
    db.close();
  });

  it('parses actor, project, tags, artifacts from frontmatter', () => {
    const db = seed();
    const first = recentWork(db).find((r) => r.title === 'First')!;
    expect(first.actor).toBe('alice');
    expect(first.project).toBe('proj-a');
    expect(first.tags).toEqual(['fix']);
    expect(first.artifacts).toEqual(['https://x/1']);
    db.close();
  });

  it('filters by project and actor', () => {
    const db = seed();
    expect(recentWork(db, { project: 'proj-a' }).map((r) => r.title)).toEqual(['Third', 'First']);
    expect(recentWork(db, { actor: 'bob' }).map((r) => r.title)).toEqual(['Second']);
    db.close();
  });

  it('respects limit', () => {
    const db = seed();
    expect(recentWork(db, { limit: 1 }).map((r) => r.title)).toEqual(['Third']);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/queries.test.ts`
Expected: FAIL — `recentWork` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/db/queries.ts`:

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
): WorkRow[] {
  const clauses = ["type = 'WorkRecord'"];
  const params: unknown[] = [];
  if (filter.project) {
    clauses.push("json_extract(frontmatter_json, '$.project') = ?");
    params.push(filter.project);
  }
  if (filter.actor) {
    clauses.push("json_extract(frontmatter_json, '$.actor') = ?");
    params.push(filter.actor);
  }
  const limit = filter.limit ?? 50;
  const rows = db
    .prepare(
      `SELECT path, title, timestamp, frontmatter_json
       FROM concepts
       WHERE ${clauses.join(' AND ')}
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(...params, limit) as {
      path: string;
      title: string | null;
      timestamp: string | null;
      frontmatter_json: string;
    }[];

  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  return rows.map((r) => {
    let fm: Record<string, unknown> = {};
    try {
      fm = JSON.parse(r.frontmatter_json) as Record<string, unknown>;
    } catch {
      fm = {};
    }
    return {
      path: r.path,
      title: r.title,
      actor: typeof fm.actor === 'string' ? fm.actor : null,
      project: typeof fm.project === 'string' ? fm.project : null,
      timestamp: r.timestamp,
      tags: strArray(fm.tags),
      artifacts: strArray(fm.artifacts),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/db/queries.test.ts`
Expected: PASS (existing tests still green; 4 new cases pass).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts lib/db/queries.test.ts
git commit -m "feat(db): recentWork query for WorkRecords

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Expose `recentWork` on `OkfService` (`lib/okf-service.ts`)

**Files:**
- Modify: `lib/okf-service.ts`
- Test: `lib/okf-service.test.ts` (append one case)

**Interfaces:**
- Consumes: `recentWork(db, filter)` + `WorkRow` from Task 2.
- Produces: `OkfService.recentWork(filter?: { project?: string; actor?: string; limit?: number }): WorkRow[]`.

- [ ] **Step 1: Write the failing test**

Append a new `it` inside the existing top-level `describe('createService (on the example bundle)', ...)` in `lib/okf-service.test.ts` (each `it` there builds its own service from the `EXAMPLE` const; the example bundle has no WorkRecords, so this asserts the method exists and returns an empty array):

```ts
  it('exposes recentWork (empty for the example bundle)', async () => {
    const svc = await createService(EXAMPLE);
    try {
      expect(Array.isArray(svc.recentWork())).toBe(true);
      expect(svc.recentWork()).toHaveLength(0);
    } finally {
      svc.close();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/okf-service.test.ts`
Expected: FAIL — `svc.recentWork is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/okf-service.ts`:

1. Extend the import from `./db/queries` to include `recentWork` and `WorkRow`:

```ts
import {
  getConcept,
  listConcepts,
  searchConcepts,
  backlinks,
  graphNeighborhood,
  graphAll,
  recentWork,
  type ConceptRow,
  type ConceptSummary,
  type SearchHit,
  type GraphData,
  type WorkRow,
} from './db/queries';
```

2. Add to the `OkfService` interface (after `fullGraph()`):

```ts
  recentWork(filter?: { project?: string; actor?: string; limit?: number }): WorkRow[];
```

3. Add to the returned object (after `fullGraph`):

```ts
    recentWork: (filter) => recentWork(db, filter),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/okf-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/okf-service.ts lib/okf-service.test.ts
git commit -m "feat(service): expose recentWork on OkfService

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ingestion auth helper (`lib/ingest-auth.ts`)

**Files:**
- Create: `lib/ingest-auth.ts`
- Test: `lib/ingest-auth.test.ts`

**Interfaces:**
- Produces:
  - `type AuthResult = { ok: true } | { ok: false; status: number; message: string }`
  - `function checkIngestAuth(header: string | null): AuthResult` (reads `process.env.OKF_INGEST_TOKEN`).

- [ ] **Step 1: Write the failing test**

Create `lib/ingest-auth.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { checkIngestAuth } from './ingest-auth';

const original = process.env.OKF_INGEST_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.OKF_INGEST_TOKEN;
  else process.env.OKF_INGEST_TOKEN = original;
});

describe('checkIngestAuth', () => {
  it('returns 503 when the token env is unset', () => {
    delete process.env.OKF_INGEST_TOKEN;
    expect(checkIngestAuth('Bearer whatever')).toEqual({
      ok: false, status: 503, message: 'ingestion not configured; set OKF_INGEST_TOKEN',
    });
  });

  it('returns ok for the correct bearer token', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer s3cret')).toEqual({ ok: true });
  });

  it('returns 401 for a wrong or missing token', () => {
    process.env.OKF_INGEST_TOKEN = 's3cret';
    expect(checkIngestAuth('Bearer nope').ok).toBe(false);
    expect((checkIngestAuth('Bearer nope') as { status: number }).status).toBe(401);
    expect((checkIngestAuth(null) as { status: number }).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest-auth.test.ts`
Expected: FAIL — cannot resolve `./ingest-auth`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/ingest-auth.ts`:

```ts
export type AuthResult = { ok: true } | { ok: false; status: number; message: string };

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkIngestAuth(header: string | null): AuthResult {
  const token = process.env.OKF_INGEST_TOKEN;
  if (!token) {
    return { ok: false, status: 503, message: 'ingestion not configured; set OKF_INGEST_TOKEN' };
  }
  const expected = `Bearer ${token}`;
  if (!header || !safeEqual(header, expected)) {
    return { ok: false, status: 401, message: 'invalid or missing bearer token' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest-auth.ts lib/ingest-auth.test.ts
git commit -m "feat(auth): ingestion bearer-token check (503 when unconfigured)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Shared agent-API surface (`app/lib/work-api.ts`)

**Files:**
- Create: `app/lib/work-api.ts`
- Test: `app/lib/work-api.test.ts`

**Interfaces:**
- Consumes: `getService`, `resetService` (`app/lib/service.ts`); `buildWorkRecordSource`, `WorkRecordInput` (Task 1); `saveContent` (`lib/edit-ops.ts`); `ValidationIssue` (`lib/okf-core/types.ts`); `WorkRow`, `SearchHit`, `ConceptRow`, `GraphData` (`lib/db/queries.ts`).
- Produces (all `async`):
  - `recordWork(input: WorkRecordInput): Promise<{ ok: boolean; path: string; issues: ValidationIssue[] }>`
  - `recentWork(filter?: { project?: string; actor?: string; limit?: number }): Promise<WorkRow[]>`
  - `searchMemory(query: string): Promise<SearchHit[]>`
  - `getConceptFull(path: string): Promise<ConceptRow | undefined>`
  - `graph(path: string, depth?: number): Promise<GraphData>`

- [ ] **Step 1: Write the failing test**

Create `app/lib/work-api.test.ts` (node env; sets a temp bundle dir before any service call; `server-only` is aliased to a no-op by `vitest.config.ts`):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-workapi-'));
  writeFileSync(join(dir, 'index.md'), '---\ntype: index\ntitle: Home\n---\nseed\n');
  process.env.OKF_BUNDLE_DIR = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_BUNDLE_DIR;
});

describe('work-api', () => {
  it('records a WorkRecord to disk and makes it queryable', async () => {
    const { recordWork, recentWork } = await import('./work-api');
    const res = await recordWork({
      title: 'Wire ingestion', summary: 'Added the endpoint.', actor: 'jungsup',
      project: 'team-okf-hub', timestamp: '2026-07-01T12:00:00Z', tags: ['feature'],
    });
    expect(res.ok).toBe(true);
    expect(res.path).toBe('work/team-okf-hub/2026-07-01-120000-wire-ingestion.md');
    const file = join(dir, res.path);
    expect(existsSync(file)).toBe(true);

    const rows = await recentWork();
    expect(rows.some((r) => r.path === res.path && r.actor === 'jungsup')).toBe(true);
  });

  it('rejects input missing required fields without writing', async () => {
    const { recordWork } = await import('./work-api');
    const res = await recordWork({ title: '', summary: '', actor: '' } as never);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(res.path).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/work-api.test.ts`
Expected: FAIL — cannot resolve `./work-api`.

- [ ] **Step 3: Write minimal implementation**

Create `app/lib/work-api.ts`:

```ts
import 'server-only';
import { getService, resetService } from './service';
import { buildWorkRecordSource, type WorkRecordInput } from '../../lib/work-record';
import { saveContent } from '../../lib/edit-ops';
import type { ValidationIssue } from '../../lib/okf-core/types';
import type { WorkRow, SearchHit, ConceptRow, GraphData } from '../../lib/db/queries';

const bundleDir = () => process.env.OKF_BUNDLE_DIR ?? 'bundles/example';

async function knownPaths(): Promise<Set<string>> {
  const svc = await getService();
  return new Set(svc.concepts().map((c) => c.path));
}

export async function recordWork(
  input: WorkRecordInput,
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
  const result = await saveContent(bundleDir(), path, content, await knownPaths());
  if (result.ok) resetService();
  return { ok: result.ok, path: result.ok ? path : '', issues: result.issues };
}

export async function recentWork(
  filter: { project?: string; actor?: string; limit?: number } = {},
): Promise<WorkRow[]> {
  return (await getService()).recentWork(filter);
}

export async function searchMemory(query: string): Promise<SearchHit[]> {
  return (await getService()).search(query);
}

export async function getConceptFull(path: string): Promise<ConceptRow | undefined> {
  return (await getService()).concept(path);
}

export async function graph(path: string, depth?: number): Promise<GraphData> {
  return (await getService()).graph(path, depth);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/work-api.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/work-api.ts app/lib/work-api.test.ts
git commit -m "feat(work-api): server-only ingestion + read surface for agents

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: REST routes (`app/api/v1/*`)

**Files:**
- Create: `app/api/v1/work/route.ts`, `app/api/v1/search/route.ts`, `app/api/v1/concept/route.ts`, `app/api/v1/graph/route.ts`
- Test: `app/api/v1/routes.test.ts`

**Interfaces:**
- Consumes: `recordWork`, `recentWork`, `searchMemory`, `getConceptFull`, `graph` (Task 5); `checkIngestAuth` (Task 4).
- Produces: HTTP handlers `GET`/`POST` per route (Web `Response`).

- [ ] **Step 1: Write the failing test**

Create `app/api/v1/routes.test.ts` (node env; only the 201 case touches disk, via a temp bundle set before import):

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;
const origToken = process.env.OKF_INGEST_TOKEN;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-routes-'));
  writeFileSync(join(dir, 'index.md'), '---\ntype: index\ntitle: Home\n---\nseed\n');
  process.env.OKF_BUNDLE_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_BUNDLE_DIR;
  if (origToken === undefined) delete process.env.OKF_INGEST_TOKEN;
  else process.env.OKF_INGEST_TOKEN = origToken;
});

const post = (body: unknown, auth?: string) =>
  new Request('http://t/api/v1/work', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/v1/work auth + validation', () => {
  it('503 when OKF_INGEST_TOKEN is unset', async () => {
    delete process.env.OKF_INGEST_TOKEN;
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: 'x', summary: 'y', actor: 'z' }, 'Bearer x'))).status).toBe(503);
  });
  it('401 with a wrong token', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: 'x', summary: 'y', actor: 'z' }, 'Bearer nope'))).status).toBe(401);
  });
  it('400 on invalid JSON', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post('{not json', 'Bearer tok'))).status).toBe(400);
  });
  it('422 when required fields are missing', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: '' }, 'Bearer tok'))).status).toBe(422);
  });
  it('201 with a valid token and body, and GET lists it', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST, GET } = await import('./work/route');
    const res = await POST(post({ title: 'Ship it', summary: 'done', actor: 'jungsup', project: 'p' }, 'Bearer tok'));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.path).toContain('work/p/');

    const list = await (await GET(new Request('http://t/api/v1/work?project=p'))).json();
    expect(list.work.some((w: { path: string }) => w.path === created.path)).toBe(true);
  });
});

describe('GET /api/v1/search + /concept', () => {
  it('search returns hits shape', async () => {
    const { GET } = await import('./search/route');
    const body = await (await GET(new Request('http://t/api/v1/search?q=seed'))).json();
    expect(body.query).toBe('seed');
    expect(Array.isArray(body.hits)).toBe(true);
  });
  it('concept 400 without path, 404 for unknown', async () => {
    const { GET } = await import('./concept/route');
    expect((await GET(new Request('http://t/api/v1/concept'))).status).toBe(400);
    expect((await GET(new Request('http://t/api/v1/concept?path=nope.md'))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/v1/routes.test.ts`
Expected: FAIL — cannot resolve `./work/route`.

- [ ] **Step 3: Write minimal implementation**

Create `app/api/v1/work/route.ts`:

```ts
import { recordWork, recentWork } from '../../../lib/work-api';
import { checkIngestAuth } from '../../../../lib/ingest-auth';
import type { WorkRecordInput } from '../../../../lib/work-record';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  const rows = await recentWork({ project, actor, limit: Number.isFinite(limit) ? limit : undefined });
  return Response.json({ work: rows });
}

export async function POST(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  let body: WorkRecordInput;
  try {
    body = (await req.json()) as WorkRecordInput;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const result = await recordWork(body);
  if (!result.ok) return Response.json({ error: 'validation failed', issues: result.issues }, { status: 422 });
  return Response.json({ ok: true, path: result.path }, { status: 201 });
}
```

Create `app/api/v1/search/route.ts`:

```ts
import { searchMemory } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const hits = await searchMemory(q);
  return Response.json({ query: q, hits });
}
```

Create `app/api/v1/concept/route.ts`:

```ts
import { getConceptFull } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const concept = await getConceptFull(path);
  if (!concept) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ concept });
}
```

Create `app/api/v1/graph/route.ts`:

```ts
import { graph } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const depthRaw = url.searchParams.get('depth');
  const depth = depthRaw !== null ? Number(depthRaw) : undefined;
  const data = await graph(path, Number.isFinite(depth) ? depth : undefined);
  return Response.json({ graph: data });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/v1/routes.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/api/v1
git commit -m "feat(api): REST v1 routes (work ingest+list, search, concept, graph)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: MCP server route (`app/api/mcp/route.ts`)

**Files:**
- Modify: `package.json` (add deps)
- Create: `app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `recordWork`, `recentWork`, `searchMemory`, `getConceptFull`, `graph` (Task 5); `checkIngestAuth` (Task 4).
- Produces: MCP Streamable-HTTP endpoint at `/api/mcp` exposing tools `okf_record_work`, `okf_recent_work`, `okf_search`, `okf_get`, `okf_graph`.

- [ ] **Step 1: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk mcp-handler zod`
Expected: added to `package.json` dependencies, no peer-dependency errors. Record the installed `mcp-handler` version: `npm ls mcp-handler`.

- [ ] **Step 2: Verify the `createMcpHandler` signature for the installed version**

Run: `node -e "const m=require('mcp-handler'); console.log(Object.keys(m))"`
Expected: includes `createMcpHandler`. Read `node_modules/mcp-handler/README.md` (or its `dist` types) to confirm the call shape `createMcpHandler(initServer, serverOptions?, config?)` where `config.basePath` mounts the route. If the installed version's signature differs, keep the five tools and the auth wrapper below identical and adapt only the handler-construction call to that version's documented API.

- [ ] **Step 3: Write the MCP route**

Create `app/api/mcp/route.ts`:

```ts
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from '../../lib/work-api';
import { checkIngestAuth } from '../../../lib/ingest-auth';

export const runtime = 'nodejs';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const handler = createMcpHandler(
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
        const r = await recordWork(args);
        return text(r.ok ? `recorded: ${r.path}` : `rejected: ${JSON.stringify(r.issues)}`);
      },
    );
    server.tool(
      'okf_recent_work',
      'List recent WorkRecords, optionally filtered by project or actor.',
      { project: z.string().optional(), actor: z.string().optional(), limit: z.number().optional() },
      async (args) => text(await recentWork(args)),
    );
    server.tool(
      'okf_search',
      'Full-text search across the org memory.',
      { query: z.string() },
      async ({ query }) => text(await searchMemory(query)),
    );
    server.tool(
      'okf_get',
      'Get the full content of one concept or WorkRecord by its bundle path.',
      { path: z.string() },
      async ({ path }) => {
        const c = await getConceptFull(path);
        return text(c ?? 'not found');
      },
    );
    server.tool(
      'okf_graph',
      'Get the graph neighborhood of a concept by path.',
      { path: z.string(), depth: z.number().optional() },
      async ({ path, depth }) => text(await graph(path, depth)),
    );
  },
  {},
  { basePath: '/api/mcp' },
);

async function authed(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(req);
}

export { authed as GET, authed as POST };
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: typecheck clean; `next build` compiles the `/api/mcp` route with no errors. (If `zod`'s inferred arg types don't line up with `recordWork`/`recentWork` params, add explicit casts at the call sites — the arg shapes match `WorkRecordInput` and the filter type by construction.)

- [ ] **Step 5: Controller smoke (MCP handshake + round-trip)**

Start the server with a token and a scratch bundle so the smoke does not touch the repo:

```bash
mkdir -p /tmp/okf-mcp-smoke && printf -- '---\ntype: index\ntitle: Home\n---\nseed\n' > /tmp/okf-mcp-smoke/index.md
OKF_INGEST_TOKEN=smoke OKF_BUNDLE_DIR=/tmp/okf-mcp-smoke npm run dev
```

Then, in another shell, verify:
1. Unauthed request is refused: `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/mcp` → `401`.
2. `tools/list` over MCP returns the five tools (authed):

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'authorization: Bearer smoke' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
Expected: a JSON/SSE response listing `okf_record_work`, `okf_recent_work`, `okf_search`, `okf_get`, `okf_graph`.

Stop the dev server after the smoke. This step is verification only — do not commit anything from it. If the MCP handshake needs an `initialize` call first, perform it per the installed SDK's protocol; the pass condition is that `tools/list` returns the five tools and the unauthed request returns 401.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/api/mcp/route.ts
git commit -m "feat(mcp): Streamable-HTTP MCP server exposing org-memory tools

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `/work` timeline view (data + component + page + nav)

**Files:**
- Modify: `app/lib/data.ts` (append `workView`)
- Test: `app/lib/data.test.ts` (append), `app/components/work-timeline.test.tsx` (create), `app/components/nav.test.tsx` (append one assertion)
- Create: `app/components/work-timeline.tsx`, `app/work/page.tsx`
- Modify: `app/components/nav.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `WorkRow` (Task 2); `recentWork` from `app/lib/work-api` (Task 5).
- Produces:
  - `interface WorkItem { path: string; title: string; actor: string | null; project: string | null; timestamp: string | null; tags: string[]; artifacts: string[]; }`
  - `interface WorkGroup { date: string; items: WorkItem[]; }`
  - `interface WorkView { filter: { project?: string; actor?: string }; groups: WorkGroup[]; total: number; }`
  - `function workView(rows: WorkRow[], filter?: { project?: string; actor?: string }): WorkView`
  - `WorkTimeline({ view }: { view: WorkView })` component.

- [ ] **Step 1: Write the failing tests**

Two import edits at the **top** of `app/lib/data.test.ts`:
1. Add `workView` to the existing `import { ... } from './data';` line.
2. Add a new line: `import type { WorkRow } from '../../lib/db/queries';`

Then append this `describe` block at the **end** of the file:

```ts
describe('workView', () => {
  const rows: WorkRow[] = [
    { path: 'work/a/2026-07-02-090000-two.md', title: 'Two', actor: 'bob', project: 'a', timestamp: '2026-07-02T09:00:00Z', tags: [], artifacts: [] },
    { path: 'work/a/2026-07-01-090000-one.md', title: 'One', actor: 'alice', project: 'a', timestamp: '2026-07-01T09:00:00Z', tags: ['fix'], artifacts: ['https://x/1'] },
    { path: 'work/a/2026-07-02-100000-three.md', title: 'Three', actor: 'alice', project: 'a', timestamp: '2026-07-02T10:00:00Z', tags: [], artifacts: [] },
  ];

  it('groups by date descending and carries the filter + total', () => {
    const v = workView(rows, { project: 'a' });
    expect(v.total).toBe(3);
    expect(v.filter.project).toBe('a');
    expect(v.groups.map((g) => g.date)).toEqual(['2026-07-02', '2026-07-01']);
    expect(v.groups[0]!.items.map((i) => i.title)).toEqual(['Two', 'Three']);
  });

  it('falls back to path when a title is null', () => {
    const v = workView([{ path: 'work/x.md', title: null, actor: null, project: null, timestamp: null, tags: [], artifacts: [] }]);
    expect(v.groups[0]!.items[0]!.title).toBe('work/x.md');
    expect(v.groups[0]!.date).toBe('undated');
  });
});
```

Create `app/components/work-timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WorkTimeline } from './work-timeline';
import type { WorkView } from '../lib/data';

afterEach(cleanup);

const view: WorkView = {
  filter: {},
  total: 1,
  groups: [
    {
      date: '2026-07-01',
      items: [
        { path: 'work/p/2026-07-01-120000-ship.md', title: 'Ship it', actor: 'jungsup', project: 'p', timestamp: '2026-07-01T12:00:00Z', tags: ['feature'], artifacts: ['https://x/pr/1'] },
      ],
    },
  ],
};

describe('WorkTimeline', () => {
  it('renders a record linking to its concept page, with actor/project/artifact', () => {
    render(<WorkTimeline view={view} />);
    expect(screen.getByRole('link', { name: 'Ship it' }).getAttribute('href')).toBe('/concept/work/p/2026-07-01-120000-ship.md');
    expect(screen.getByRole('link', { name: 'jungsup' }).getAttribute('href')).toBe('/work?actor=jungsup');
    expect(screen.getByRole('link', { name: 'p' }).getAttribute('href')).toBe('/work?project=p');
    expect(screen.getByRole('link', { name: 'https://x/pr/1' }).getAttribute('href')).toBe('https://x/pr/1');
  });

  it('shows an empty state when there are no records', () => {
    render(<WorkTimeline view={{ filter: {}, total: 0, groups: [] }} />);
    expect(screen.getByText(/No work records yet/i)).toBeTruthy();
  });
});
```

Append to `app/components/nav.test.tsx` inside the existing `describe`:

```ts
  it('links to the work timeline', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /^Work$/ }).getAttribute('href')).toBe('/work');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/data.test.ts app/components/work-timeline.test.tsx app/components/nav.test.tsx`
Expected: FAIL — `workView` undefined; `./work-timeline` unresolved; no `Work` link.

- [ ] **Step 3: Write the implementations**

In `app/lib/data.ts`, add `type WorkRow` to the existing queries import so it reads:

```ts
import { SNIPPET_OPEN, SNIPPET_CLOSE, type WorkRow } from '../../lib/db/queries';
```

Then append the view-model to the end of the file:

```ts
export interface WorkItem {
  path: string;
  title: string;
  actor: string | null;
  project: string | null;
  timestamp: string | null;
  tags: string[];
  artifacts: string[];
}

export interface WorkGroup {
  date: string;
  items: WorkItem[];
}

export interface WorkView {
  filter: { project?: string; actor?: string };
  groups: WorkGroup[];
  total: number;
}

export function workView(
  rows: WorkRow[],
  filter: { project?: string; actor?: string } = {},
): WorkView {
  const byDate = new Map<string, WorkItem[]>();
  for (const r of rows) {
    const date = r.timestamp ? r.timestamp.slice(0, 10) : 'undated';
    const item: WorkItem = {
      path: r.path,
      title: r.title ?? r.path,
      actor: r.actor,
      project: r.project,
      timestamp: r.timestamp,
      tags: r.tags,
      artifacts: r.artifacts,
    };
    const list = byDate.get(date);
    if (list) list.push(item);
    else byDate.set(date, [item]);
  }
  const groups = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
  return { filter, groups, total: rows.length };
}
```

Create `app/components/work-timeline.tsx`:

```tsx
import Link from 'next/link';
import type { WorkView } from '../lib/data';

export function WorkTimeline({ view }: { view: WorkView }) {
  const { filter, groups, total } = view;
  const filtered = Boolean(filter.project || filter.actor);
  return (
    <section className="okf-work-timeline">
      <header className="okf-work-header">
        <h1>Work</h1>
        <p className="okf-work-count">
          {total} record{total === 1 ? '' : 's'}
          {filtered ? ' · filtered' : ''}
        </p>
        {filtered ? (
          <Link href="/work" className="okf-work-clear">Clear filters</Link>
        ) : null}
      </header>
      {groups.length === 0 ? (
        <p className="okf-work-empty">
          No work records yet. Agents record work via the MCP tool <code>okf_record_work</code>{' '}
          or <code>POST /api/v1/work</code>.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="okf-work-group">
            <h2 className="okf-work-date">{g.date}</h2>
            <ul className="okf-work-list">
              {g.items.map((it) => (
                <li key={it.path} className="okf-work-item">
                  <Link href={`/concept/${it.path}`} className="okf-work-title">{it.title}</Link>
                  <div className="okf-work-meta">
                    {it.actor ? (
                      <Link href={`/work?actor=${encodeURIComponent(it.actor)}`} className="okf-work-actor">{it.actor}</Link>
                    ) : null}
                    {it.project ? (
                      <Link href={`/work?project=${encodeURIComponent(it.project)}`} className="okf-work-project">{it.project}</Link>
                    ) : null}
                    {it.timestamp ? <time className="okf-work-time" dateTime={it.timestamp}>{it.timestamp}</time> : null}
                  </div>
                  {it.tags.length > 0 ? (
                    <div className="okf-work-tags">
                      {it.tags.map((t) => <span key={t} className="okf-work-tag">{t}</span>)}
                    </div>
                  ) : null}
                  {it.artifacts.length > 0 ? (
                    <ul className="okf-work-artifacts">
                      {it.artifacts.map((a) => (
                        <li key={a}><a href={a} target="_blank" rel="noopener noreferrer nofollow">{a}</a></li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
```

Create `app/work/page.tsx`:

```tsx
import { recentWork } from '../lib/work-api';
import { workView } from '../lib/data';
import { WorkTimeline } from '../components/work-timeline';

export const dynamic = 'force-dynamic';

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[]; actor?: string | string[] }>;
}) {
  const sp = await searchParams;
  const project = Array.isArray(sp.project) ? sp.project[0] : sp.project;
  const actor = Array.isArray(sp.actor) ? sp.actor[0] : sp.actor;
  const rows = await recentWork({ project, actor });
  const view = workView(rows, { project, actor });
  return (
    <main className="okf-work okf-screen">
      <WorkTimeline view={view} />
    </main>
  );
}
```

In `app/components/nav.tsx`, add the Work link right after the `+ new` link:

```tsx
        <Link href="/concept/new" className="okf-nav__link">+ new</Link>
        <Link href="/work" className="okf-nav__link">Work</Link>
```

Append to `app/globals.css` (Blueprint-consistent; reuses existing tokens):

```css
/* --- Work timeline --- */
.okf-work-timeline { display: flex; flex-direction: column; gap: 20px; }
.okf-work-header { display: flex; align-items: baseline; gap: 12px; }
.okf-work-count { color: var(--okf-muted, #5b6b82); font-size: 0.85rem; }
.okf-work-clear { font-size: 0.8rem; }
.okf-work-empty { color: var(--okf-muted, #5b6b82); }
.okf-work-group { display: flex; flex-direction: column; gap: 8px; }
.okf-work-date { font-family: var(--okf-mono, ui-monospace, monospace); font-size: 0.8rem; letter-spacing: 0.04em; color: var(--okf-accent, #2563eb); }
.okf-work-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.okf-work-item { border: 1px solid var(--okf-border, #d7deea); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.okf-work-title { font-weight: 600; }
.okf-work-meta { display: flex; gap: 12px; font-size: 0.8rem; color: var(--okf-muted, #5b6b82); }
.okf-work-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.okf-work-tag { font-size: 0.72rem; padding: 1px 7px; border-radius: 999px; background: var(--okf-chip-bg, #eef2fb); color: var(--okf-ink, #0f2747); }
.okf-work-artifacts { margin: 0; padding-left: 18px; font-size: 0.8rem; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/data.test.ts app/components/work-timeline.test.tsx app/components/nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Route smoke (browser) — the M2a lesson**

Run `npm run build` (expect the `/work` and all `/api/*` routes to compile), then start the dev server with a token + scratch bundle and verify at runtime (build alone did not catch the M2a catch-all 500):

```bash
mkdir -p /tmp/okf-work-smoke && printf -- '---\ntype: index\ntitle: Home\n---\nseed\n' > /tmp/okf-work-smoke/index.md
OKF_INGEST_TOKEN=smoke OKF_BUNDLE_DIR=/tmp/okf-work-smoke npm run dev
```

1. Load `http://localhost:3000/work` → 200 with the empty state (no 500).
2. `curl -s -X POST http://localhost:3000/api/v1/work -H 'authorization: Bearer smoke' -H 'content-type: application/json' -d '{"title":"Smoke record","summary":"verifying /work","actor":"jungsup","project":"team-okf-hub","tags":["smoke"],"artifacts":["https://example.com/pr/1"]}'` → `201` with a `path`.
3. Reload `/work` → the record appears under its date, with actor/project/tag/artifact; its title links to `/concept/work/team-okf-hub/...`.
4. `curl 'http://localhost:3000/api/v1/work'` → JSON includes the record.

Stop the dev server. The scratch bundle is under `/tmp`, so the repo tree stays clean (confirm `git status` is clean before committing).

- [ ] **Step 6: Commit**

```bash
git add app/lib/data.ts app/lib/data.test.ts app/components/work-timeline.tsx app/components/work-timeline.test.tsx app/components/nav.tsx app/components/nav.test.tsx app/work/page.tsx app/globals.css
git commit -m "feat(web): /work timeline view + nav link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the org-memory section to README**

Append a new section to `README.md` (place it after the existing usage sections). Use exactly this content:

````markdown
## Org memory (WorkRecords)

OKF Hub doubles as an **org-wide work-record memory for AI agents**: agents record
completed work as OKF `WorkRecord` concepts and query them back — via **MCP** (primary)
and a **REST** mirror.

### Configuration

Set a shared ingestion token (required for all writes; if unset, writes are refused
with HTTP 503):

```bash
export OKF_INGEST_TOKEN="<a long random string>"
export OKF_BUNDLE_DIR="/path/to/your/okf-bundle"   # defaults to bundles/example
npm run dev
```

### Register the MCP server in Claude Code

```bash
claude mcp add --transport http okf-hub http://localhost:3000/api/mcp \
  --header "Authorization: Bearer $OKF_INGEST_TOKEN"
```

Tools then available in every session:

| Tool | Purpose |
| --- | --- |
| `okf_record_work` | record a completed task as a WorkRecord (write) |
| `okf_recent_work` | list recent WorkRecords (filter by `project`/`actor`) |
| `okf_search` | full-text search the memory |
| `okf_get` | fetch one concept/WorkRecord by path |
| `okf_graph` | graph neighborhood of a concept |

### REST mirror

```bash
# record work (write — requires the bearer token)
curl -X POST http://localhost:3000/api/v1/work \
  -H "Authorization: Bearer $OKF_INGEST_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Add sanitize","summary":"Hardened render path.","actor":"jungsup","project":"team-okf-hub","tags":["security"],"artifacts":["https://github.com/org/repo/pull/12"]}'

# read (open)
curl 'http://localhost:3000/api/v1/work?project=team-okf-hub'
curl 'http://localhost:3000/api/v1/search?q=sanitize'
curl 'http://localhost:3000/api/v1/concept?path=work/team-okf-hub/2026-07-01-142305-add-sanitize.md'
```

A WorkRecord is a normal OKF concept (`type: WorkRecord`) stored at
`work/<project>/<YYYY-MM-DD>-<HHMMSS>-<slug>.md`. Bodies are sanitized on render, and
links in the body (`[orders](tables/orders.md)`) wire work into the knowledge graph.
Browse recent work at `/work`.
````

- [ ] **Step 2: Verify the doc renders**

Run: `npx vitest run` (full suite — confirm docs change broke nothing) and visually confirm the Markdown is well-formed (no broken code fences).
Expected: full suite green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: org-memory (WorkRecords) — MCP + REST usage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (before finishing the branch)

- [ ] `npm test` — full suite green (target: existing 73 + new work-record/queries/service/ingest-auth/work-api/routes/data/work-timeline/nav cases).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build` — all routes compile (`/work`, `/api/v1/work`, `/api/v1/search`, `/api/v1/concept`, `/api/v1/graph`, `/api/mcp`).
- [ ] Runtime route-smoke (Task 8 Step 5 + Task 7 Step 5) passed and the working tree is clean (no scratch WorkRecords committed into `bundles/example/`).
- [ ] Then use superpowers:finishing-a-development-branch.
