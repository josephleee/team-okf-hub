# OKF Hub — M1a: Core Library, Index & CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure TypeScript core of OKF Hub — parse/validate/link/graph an OKF bundle, render Markdown, index it into SQLite (with FTS5 search), and expose it via a small `okf` CLI — with no web UI and no network.

**Architecture:** A single Node/TypeScript project (the eventual home of the Next.js app). `lib/okf-core/` holds pure, I/O-free logic (parse, validate, links, render, build-bundle). `lib/bundle-loader.ts` does filesystem I/O. `lib/db/` builds and queries a disposable SQLite index (the cache; git stays the source of truth). `scripts/okf.ts` is a thin CLI over those. Everything is developed test-first with Vitest.

**Tech Stack:** Node ≥20, TypeScript (ESM), Vitest, tsx, gray-matter (frontmatter), unified/remark/rehype (Markdown parse + HTML render + link extraction), better-sqlite3 (index + FTS5).

## Global Constraints

- **Node ≥ 20**, ESM (`"type": "module"`), TypeScript `strict: true`, `moduleResolution: "Bundler"` (relative imports written WITHOUT file extensions).
- **License:** Apache-2.0 (already in repo). Do not add per-file license headers.
- **OKF rules (verbatim from spec):** `type` is the only **required** frontmatter field. Field checks: `tags` must be a list; `timestamp` should be ISO-8601; `resource` should be a valid URL.
- **Link integrity:** internal Markdown links must resolve to an existing concept file; an unresolved internal link is a **warning** (not fatal). A malformed concept is still listed, flagged with a parse error, and must not break the rest of the bundle.
- **Git is the source of truth.** The SQLite index is a disposable cache, always rebuildable from the bundle — never store anything in it that can't be regenerated.
- **Commit identity:** this repo's local git is configured as `Joseph <jungsup@kakao.com>`; use normal `git commit` (do not pass `--author`).
- **Path convention:** all concept paths are POSIX, relative to the bundle root, with no leading `./` (e.g. `tables/orders.md`).

---

### Task 1: Project scaffold (TypeScript + Vitest + tsx)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `lib/okf-core/version.ts`
- Test: `lib/okf-core/version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` (Vitest) and `npm run typecheck` (`tsc --noEmit`); `export const VERSION: string`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "team-okf-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "Apache-2.0",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "okf": "tsx scripts/okf.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["lib", "scripts", "*.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Write the failing test**

`lib/okf-core/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VERSION } from './version';

describe('VERSION', () => {
  it('is a semver-ish string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./version`.

- [ ] **Step 7: Write minimal implementation**

`lib/okf-core/version.ts`:

```ts
export const VERSION = '0.1.0';
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test). Also run `npm run typecheck` → no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts lib/okf-core/version.ts lib/okf-core/version.test.ts package-lock.json
git commit -m "chore: scaffold TypeScript + Vitest project"
```

---

### Task 2: `parseConcept` — frontmatter + body parsing

**Files:**
- Create: `lib/okf-core/types.ts`, `lib/okf-core/parse.ts`
- Test: `lib/okf-core/parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface RawFile { path: string; content: string }`
  - `interface Concept { path: string; type: string; title?: string; description?: string; resource?: string; tags: string[]; timestamp?: string; frontmatter: Record<string, unknown>; body: string; parseError?: string }`
  - `function parseConcept(path: string, content: string): Concept`

- [ ] **Step 1: Add dependency**

Run: `npm install gray-matter@^4.0.3`
Expected: added to `dependencies`.

- [ ] **Step 2: Create the types file**

`lib/okf-core/types.ts`:

```ts
export interface RawFile {
  path: string;
  content: string;
}

export interface Concept {
  path: string;
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags: string[];
  timestamp?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  parseError?: string;
}
```

- [ ] **Step 3: Write the failing test**

`lib/okf-core/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseConcept } from './parse';

const DOC = `---
type: BigQuery Table
title: Orders
description: One row per completed order.
resource: https://console.cloud.google.com/bigquery
tags: [sales, revenue]
timestamp: 2026-05-28T14:30:00Z
---

# Schema
Body text here.
`;

describe('parseConcept', () => {
  it('extracts the required type and optional fields', () => {
    const c = parseConcept('tables/orders.md', DOC);
    expect(c.path).toBe('tables/orders.md');
    expect(c.type).toBe('BigQuery Table');
    expect(c.title).toBe('Orders');
    expect(c.description).toBe('One row per completed order.');
    expect(c.resource).toBe('https://console.cloud.google.com/bigquery');
    expect(c.tags).toEqual(['sales', 'revenue']);
    expect(c.timestamp).toBe('2026-05-28T14:30:00.000Z');
    expect(c.body).toContain('# Schema');
    expect(c.parseError).toBeUndefined();
  });

  it('defaults tags to [] and leaves missing fields undefined', () => {
    const c = parseConcept('x.md', '---\ntype: Note\n---\nhi');
    expect(c.tags).toEqual([]);
    expect(c.title).toBeUndefined();
    expect(c.type).toBe('Note');
  });

  it('records a parseError instead of throwing on malformed YAML', () => {
    const c = parseConcept('bad.md', '---\ntype: [unclosed\n---\nbody');
    expect(c.parseError).toBeTruthy();
    expect(c.body).toBeDefined();
  });

  it('treats a document with no frontmatter as having empty type', () => {
    const c = parseConcept('plain.md', 'just text');
    expect(c.type).toBe('');
    expect(c.body).toBe('just text');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- parse`
Expected: FAIL — cannot resolve `./parse`.

- [ ] **Step 5: Write minimal implementation**

`lib/okf-core/parse.ts`:

```ts
import matter from 'gray-matter';
import type { Concept } from './types';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function parseConcept(path: string, content: string): Concept {
  let data: Record<string, unknown> = {};
  let body = content;
  let parseError: string | undefined;

  try {
    const parsed = matter(content);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  const rawTs = data.timestamp;
  const timestamp =
    typeof rawTs === 'string' ? rawTs : rawTs instanceof Date ? rawTs.toISOString() : undefined;

  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    path,
    type: asString(data.type) ?? '',
    title: asString(data.title),
    description: asString(data.description),
    resource: asString(data.resource),
    tags,
    timestamp,
    frontmatter: data,
    body,
    parseError,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- parse`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/okf-core/types.ts lib/okf-core/parse.ts lib/okf-core/parse.test.ts package.json package-lock.json
git commit -m "feat(core): parse OKF concept frontmatter and body"
```

---

### Task 3: `validateConcept` — OKF validation rules

**Files:**
- Modify: `lib/okf-core/types.ts` (add issue types)
- Create: `lib/okf-core/validate.ts`
- Test: `lib/okf-core/validate.test.ts`

**Interfaces:**
- Consumes: `Concept` (Task 2).
- Produces:
  - `type Severity = 'error' | 'warning'`
  - `interface ValidationIssue { path: string; severity: Severity; field?: string; message: string }`
  - `function validateConcept(c: Concept): ValidationIssue[]`

- [ ] **Step 1: Extend the types file**

Append to `lib/okf-core/types.ts`:

```ts
export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  path: string;
  severity: Severity;
  field?: string;
  message: string;
}
```

- [ ] **Step 2: Write the failing test**

`lib/okf-core/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseConcept } from './parse';
import { validateConcept } from './validate';

function issuesFor(doc: string) {
  return validateConcept(parseConcept('x.md', doc));
}

describe('validateConcept', () => {
  it('passes a valid concept with no issues', () => {
    const issues = issuesFor('---\ntype: Note\ntimestamp: 2026-01-01T00:00:00Z\nresource: https://a.b\n---\nhi');
    expect(issues).toEqual([]);
  });

  it('errors when type is missing', () => {
    const issues = issuesFor('---\ntitle: No Type\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', field: 'type' }),
    );
  });

  it('errors when tags is not a list', () => {
    const issues = issuesFor('---\ntype: Note\ntags: oops\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', field: 'tags' }),
    );
  });

  it('warns on a non-ISO timestamp', () => {
    const issues = issuesFor('---\ntype: Note\ntimestamp: "not-a-date"\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', field: 'timestamp' }),
    );
  });

  it('warns on an invalid resource URL', () => {
    const issues = issuesFor('---\ntype: Note\nresource: "not a url"\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', field: 'resource' }),
    );
  });

  it('reports a single error for a parse failure and stops', () => {
    const issues = issuesFor('---\ntype: [unclosed\n---\nhi');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 4: Write minimal implementation**

`lib/okf-core/validate.ts`:

```ts
import type { Concept, ValidationIssue } from './types';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isValidTimestamp(s: string): boolean {
  return ISO_8601.test(s) && !Number.isNaN(Date.parse(s));
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export function validateConcept(c: Concept): ValidationIssue[] {
  if (c.parseError) {
    return [{ path: c.path, severity: 'error', message: `Frontmatter parse error: ${c.parseError}` }];
  }

  const issues: ValidationIssue[] = [];

  if (!c.type) {
    issues.push({ path: c.path, severity: 'error', field: 'type', message: '`type` is required' });
  }

  if (c.frontmatter.tags !== undefined && !Array.isArray(c.frontmatter.tags)) {
    issues.push({ path: c.path, severity: 'error', field: 'tags', message: '`tags` must be a list' });
  }

  if (c.timestamp !== undefined && !isValidTimestamp(c.timestamp)) {
    issues.push({ path: c.path, severity: 'warning', field: 'timestamp', message: '`timestamp` should be ISO-8601' });
  }

  if (c.resource !== undefined && !isValidUrl(c.resource)) {
    issues.push({ path: c.path, severity: 'warning', field: 'resource', message: '`resource` should be a valid URL' });
  }

  return issues;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- validate`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/okf-core/types.ts lib/okf-core/validate.ts lib/okf-core/validate.test.ts
git commit -m "feat(core): validate OKF concept fields"
```

---

### Task 4: `extractLinks` / `resolveLink` — Markdown link graph edges

**Files:**
- Modify: `lib/okf-core/types.ts` (add `Link`)
- Create: `lib/okf-core/links.ts`
- Test: `lib/okf-core/links.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (operates on raw body text).
- Produces:
  - `interface Link { from: string; toRaw: string; to?: string; resolved: boolean; external: boolean }`
  - `function resolveLink(fromPath: string, toRaw: string, knownPaths: Set<string>): { to?: string; resolved: boolean; external: boolean }`
  - `function extractLinks(fromPath: string, body: string, knownPaths?: Set<string>): Link[]`

- [ ] **Step 1: Add dependencies**

Run: `npm install unified@^11 remark-parse@^11 remark-gfm@^4 unist-util-visit@^5 && npm install -D @types/mdast@^4`
Expected: added.

- [ ] **Step 2: Extend the types file**

Append to `lib/okf-core/types.ts`:

```ts
export interface Link {
  from: string;
  toRaw: string;
  to?: string;
  resolved: boolean;
  external: boolean;
}
```

- [ ] **Step 3: Write the failing test**

`lib/okf-core/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractLinks, resolveLink } from './links';

const KNOWN = new Set(['tables/orders.md', 'tables/customers.md', 'metrics/wau.md']);

describe('resolveLink', () => {
  it('resolves a sibling relative link', () => {
    const r = resolveLink('tables/orders.md', 'customers.md', KNOWN);
    expect(r).toEqual({ to: 'tables/customers.md', resolved: true, external: false });
  });

  it('resolves a parent-relative link and strips fragments', () => {
    const r = resolveLink('tables/orders.md', '../metrics/wau.md#section', KNOWN);
    expect(r).toEqual({ to: 'metrics/wau.md', resolved: true, external: false });
  });

  it('resolves a root-absolute (leading slash) link from bundle root', () => {
    const r = resolveLink('tables/orders.md', '/tables/customers.md', KNOWN);
    expect(r.to).toBe('tables/customers.md');
    expect(r.resolved).toBe(true);
  });

  it('marks http(s) links external and unresolved', () => {
    const r = resolveLink('tables/orders.md', 'https://example.com', KNOWN);
    expect(r).toEqual({ to: undefined, resolved: false, external: true });
  });

  it('marks an internal link to a missing file unresolved', () => {
    const r = resolveLink('tables/orders.md', 'ghost.md', KNOWN);
    expect(r).toEqual({ to: undefined, resolved: false, external: false });
  });
});

describe('extractLinks', () => {
  it('finds all Markdown links in the body', () => {
    const body = 'See [customers](customers.md) and [wau](../metrics/wau.md) and [ext](https://x.io).';
    const links = extractLinks('tables/orders.md', body, KNOWN);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.toRaw)).toEqual(['customers.md', '../metrics/wau.md', 'https://x.io']);
    expect(links.filter((l) => l.resolved)).toHaveLength(2);
    expect(links.filter((l) => l.external)).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- links`
Expected: FAIL — cannot resolve `./links`.

- [ ] **Step 5: Write minimal implementation**

`lib/okf-core/links.ts`:

```ts
import { posix } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { Link } from './types';

const parser = unified().use(remarkParse).use(remarkGfm);

function normalizeTarget(fromPath: string, toRel: string): string {
  if (toRel.startsWith('/')) {
    return posix.normalize(toRel.replace(/^\/+/, ''));
  }
  const dir = posix.dirname(fromPath);
  return posix.normalize(posix.join(dir, toRel)).replace(/^(\.\/)+/, '');
}

export function resolveLink(fromPath: string, toRaw: string, knownPaths: Set<string>) {
  // Anything with a URI scheme (http:, mailto:, etc.) or protocol-relative is external.
  if (/^[a-z][a-z0-9+.-]*:/i.test(toRaw) || toRaw.startsWith('//')) {
    return { to: undefined, resolved: false, external: true };
  }
  const clean = toRaw.split('#')[0]!.split('?')[0]!;
  if (!clean) {
    return { to: undefined, resolved: false, external: false }; // pure anchor / empty
  }
  const target = normalizeTarget(fromPath, clean);
  const resolved = knownPaths.has(target);
  return { to: resolved ? target : undefined, resolved, external: false };
}

export function extractLinks(fromPath: string, body: string, knownPaths: Set<string> = new Set()): Link[] {
  const tree = parser.parse(body) as Root;
  const links: Link[] = [];
  visit(tree, 'link', (node) => {
    const r = resolveLink(fromPath, node.url, knownPaths);
    links.push({ from: fromPath, toRaw: node.url, to: r.to, resolved: r.resolved, external: r.external });
  });
  return links;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- links`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/okf-core/types.ts lib/okf-core/links.ts lib/okf-core/links.test.ts package.json package-lock.json
git commit -m "feat(core): extract and resolve concept links"
```

---

### Task 5: `renderMarkdown` — Markdown → HTML

**Files:**
- Create: `lib/okf-core/render.ts`
- Test: `lib/okf-core/render.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function renderMarkdown(body: string): string` (synchronous; returns an HTML fragment).

- [ ] **Step 1: Add dependencies**

Run: `npm install remark-rehype@^11 rehype-stringify@^10`
Expected: added.

- [ ] **Step 2: Write the failing test**

`lib/okf-core/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  it('renders headings and emphasis to HTML', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('').trim()).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- render`
Expected: FAIL — cannot resolve `./render`.

- [ ] **Step 4: Write minimal implementation**

`lib/okf-core/render.ts`:

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

export function renderMarkdown(body: string): string {
  return String(processor.processSync(body));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- render`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/okf-core/render.ts lib/okf-core/render.test.ts package.json package-lock.json
git commit -m "feat(core): render Markdown body to HTML"
```

---

### Task 6: `buildBundle` — assemble concepts, links & issues

**Files:**
- Modify: `lib/okf-core/types.ts` (add `Bundle`)
- Create: `lib/okf-core/bundle.ts`, `lib/okf-core/index.ts` (barrel)
- Test: `lib/okf-core/bundle.test.ts`

**Interfaces:**
- Consumes: `parseConcept`, `validateConcept`, `extractLinks`, `RawFile`, `Concept`, `Link`, `ValidationIssue`.
- Produces:
  - `interface Bundle { concepts: Concept[]; links: Link[]; issues: ValidationIssue[] }`
  - `function buildBundle(files: RawFile[]): Bundle`
  - barrel `lib/okf-core/index.ts` re-exporting all public symbols + types.

- [ ] **Step 1: Extend the types file**

Append to `lib/okf-core/types.ts`:

```ts
export interface Bundle {
  concepts: Concept[];
  links: Link[];
  issues: ValidationIssue[];
}
```

- [ ] **Step 2: Write the failing test**

`lib/okf-core/bundle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBundle } from './bundle';
import type { RawFile } from './types';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\n---\nLinks to [c](customers.md) and [missing](ghost.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\n---\nNo type problems.' },
  { path: 'bad.md', content: '---\ntitle: no type\n---\nbody' },
];

describe('buildBundle', () => {
  it('parses every file into a concept', () => {
    const b = buildBundle(FILES);
    expect(b.concepts.map((c) => c.path)).toEqual(['tables/orders.md', 'tables/customers.md', 'bad.md']);
  });

  it('resolves links against the set of concept paths', () => {
    const b = buildBundle(FILES);
    const resolved = b.links.filter((l) => l.resolved).map((l) => l.to);
    expect(resolved).toEqual(['tables/customers.md']);
  });

  it('emits a warning for a broken internal link', () => {
    const b = buildBundle(FILES);
    expect(b.issues).toContainEqual(
      expect.objectContaining({ path: 'tables/orders.md', severity: 'warning', field: 'link' }),
    );
  });

  it('emits a type error for the concept missing a type', () => {
    const b = buildBundle(FILES);
    expect(b.issues).toContainEqual(
      expect.objectContaining({ path: 'bad.md', severity: 'error', field: 'type' }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- bundle`
Expected: FAIL — cannot resolve `./bundle`.

- [ ] **Step 4: Write minimal implementation**

`lib/okf-core/bundle.ts`:

```ts
import { parseConcept } from './parse';
import { validateConcept } from './validate';
import { extractLinks } from './links';
import type { RawFile, Bundle, Concept, Link, ValidationIssue } from './types';

export function buildBundle(files: RawFile[]): Bundle {
  const concepts: Concept[] = files.map((f) => parseConcept(f.path, f.content));
  const knownPaths = new Set(concepts.map((c) => c.path));
  const links: Link[] = [];
  const issues: ValidationIssue[] = [];

  for (const c of concepts) {
    issues.push(...validateConcept(c));

    if (c.parseError) continue; // don't try to read links from an unparseable doc

    const conceptLinks = extractLinks(c.path, c.body, knownPaths);
    links.push(...conceptLinks);

    for (const l of conceptLinks) {
      if (!l.external && !l.resolved) {
        issues.push({
          path: c.path,
          severity: 'warning',
          field: 'link',
          message: `Broken link: ${l.toRaw}`,
        });
      }
    }
  }

  return { concepts, links, issues };
}
```

- [ ] **Step 5: Create the barrel export**

`lib/okf-core/index.ts`:

```ts
export * from './types';
export { parseConcept } from './parse';
export { validateConcept } from './validate';
export { extractLinks, resolveLink } from './links';
export { renderMarkdown } from './render';
export { buildBundle } from './bundle';
export { VERSION } from './version';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- bundle` then `npm run typecheck`
Expected: PASS (4 tests); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add lib/okf-core/types.ts lib/okf-core/bundle.ts lib/okf-core/index.ts lib/okf-core/bundle.test.ts
git commit -m "feat(core): build a bundle with resolved links and aggregated issues"
```

---

### Task 7: Sample OKF bundle (`bundles/example`)

**Files:**
- Create: `bundles/example/index.md`, `bundles/example/datasets/orders_db.md`, `bundles/example/tables/orders.md`, `bundles/example/tables/customers.md`, `bundles/example/metrics/weekly_active_users.md`
- Test: `lib/okf-core/example-bundle.test.ts`

**Interfaces:**
- Consumes: `buildBundle`, plus the Task 8 loader is NOT yet available — this test reads files via `node:fs` directly to assert the authored bundle is internally consistent.
- Produces: a valid demo bundle used by later tasks (loader, service, CLI).

- [ ] **Step 1: Create `bundles/example/index.md`**

```markdown
---
type: Index
title: Acme Sales Knowledge
description: Curated knowledge about Acme's sales data.
tags: [sales]
timestamp: 2026-05-28T14:30:00Z
---

# Acme Sales Knowledge

Start with the [orders table](tables/orders.md) or the
[weekly active users metric](metrics/weekly_active_users.md).
```

- [ ] **Step 2: Create `bundles/example/datasets/orders_db.md`**

```markdown
---
type: Dataset
title: orders_db
description: Primary transactional dataset for sales.
resource: https://console.cloud.google.com/bigquery?d=orders_db
tags: [sales]
timestamp: 2026-05-28T14:30:00Z
---

# orders_db

Contains the [orders](../tables/orders.md) and [customers](../tables/customers.md) tables.
```

- [ ] **Step 3: Create `bundles/example/tables/orders.md`**

```markdown
---
type: BigQuery Table
title: Orders
description: One row per completed customer order.
resource: https://console.cloud.google.com/bigquery?t=orders
tags: [sales, revenue]
timestamp: 2026-05-28T14:30:00Z
---

# Schema

| Column | Type | Description |
|--------|------|-------------|
| `order_id` | STRING | Globally unique order identifier. |
| `customer_id` | STRING | FK to [customers](customers.md). |

# Joins

Joined with [customers](customers.md) on `customer_id`. Feeds the
[weekly active users](../metrics/weekly_active_users.md) metric.

See the [BigQuery console](https://console.cloud.google.com/bigquery?t=orders).
```

- [ ] **Step 4: Create `bundles/example/tables/customers.md`**

```markdown
---
type: BigQuery Table
title: Customers
description: One row per customer.
resource: https://console.cloud.google.com/bigquery?t=customers
tags: [sales]
timestamp: 2026-05-28T14:30:00Z
---

# Schema

| Column | Type | Description |
|--------|------|-------------|
| `customer_id` | STRING | Globally unique customer identifier. |
| `country` | STRING | ISO country code. |
```

- [ ] **Step 5: Create `bundles/example/metrics/weekly_active_users.md`**

```markdown
---
type: Metric
title: Weekly Active Users
description: Distinct customers ordering in a 7-day window.
tags: [sales, engagement]
timestamp: 2026-05-28T14:30:00Z
---

# Definition

Distinct `customer_id` from [orders](../tables/orders.md) within a trailing
7-day window.
```

- [ ] **Step 6: Write the test asserting the bundle is consistent**

`lib/okf-core/example-bundle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildBundle } from './bundle';
import type { RawFile } from './types';

const ROOT = join(process.cwd(), 'bundles/example');

function readMd(dir: string): RawFile[] {
  const out: RawFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readMd(full));
    else if (name.endsWith('.md')) {
      out.push({ path: relative(ROOT, full).split(sep).join('/'), content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

describe('example bundle', () => {
  const bundle = buildBundle(readMd(ROOT));

  it('has five concepts, each with a type', () => {
    expect(bundle.concepts).toHaveLength(5);
    expect(bundle.concepts.every((c) => c.type.length > 0)).toBe(true);
  });

  it('has no error-severity issues and no broken links', () => {
    expect(bundle.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(bundle.issues.filter((i) => i.field === 'link')).toEqual([]);
  });

  it('has every internal link resolved', () => {
    const internal = bundle.links.filter((l) => !l.external);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((l) => l.resolved)).toBe(true);
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- example-bundle`
Expected: PASS (3 tests). If a link warning appears, fix the offending Markdown link path in the bundle until clean.

- [ ] **Step 8: Commit**

```bash
git add bundles/example lib/okf-core/example-bundle.test.ts
git commit -m "feat: add example acme-sales OKF bundle"
```

---

### Task 8: `readBundleFromDir` — filesystem loader

**Files:**
- Create: `lib/bundle-loader.ts`
- Test: `lib/bundle-loader.test.ts`

**Interfaces:**
- Consumes: `RawFile` (Task 2).
- Produces: `async function readBundleFromDir(dir: string): Promise<RawFile[]>` — recursively reads `*.md`, returns POSIX paths relative to `dir`, sorted by path.

- [ ] **Step 1: Write the failing test**

`lib/bundle-loader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readBundleFromDir } from './bundle-loader';

const EXAMPLE = join(process.cwd(), 'bundles/example');

describe('readBundleFromDir', () => {
  it('reads all markdown files recursively with POSIX relative paths', async () => {
    const files = await readBundleFromDir(EXAMPLE);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('index.md');
    expect(paths).toContain('tables/orders.md');
    expect(paths).toContain('metrics/weekly_active_users.md');
    expect(paths.every((p) => !p.includes('\\'))).toBe(true);
  });

  it('returns files sorted by path with their content', async () => {
    const files = await readBundleFromDir(EXAMPLE);
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    expect(files).toEqual(sorted);
    const orders = files.find((f) => f.path === 'tables/orders.md');
    expect(orders?.content).toContain('type: BigQuery Table');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bundle-loader`
Expected: FAIL — cannot resolve `./bundle-loader`.

- [ ] **Step 3: Write minimal implementation**

`lib/bundle-loader.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { RawFile } from './okf-core/types';

export async function readBundleFromDir(dir: string): Promise<RawFile[]> {
  const files: RawFile[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(full, 'utf8');
        files.push({ path: relative(dir, full).split(sep).join('/'), content });
      }
    }
  }

  await walk(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bundle-loader`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/bundle-loader.ts lib/bundle-loader.test.ts
git commit -m "feat: load an OKF bundle from a directory"
```

---

### Task 9: SQLite schema + `buildIndex`

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/build.ts`
- Test: `lib/db/build.test.ts`

**Interfaces:**
- Consumes: `Bundle` (Task 6), `renderMarkdown` (Task 5).
- Produces:
  - `type DB = Database.Database`
  - `const SCHEMA: string`
  - `function initSchema(db: DB): void`
  - `function buildIndex(db: DB, bundle: Bundle): void`

- [ ] **Step 1: Add dependencies**

Run: `npm install better-sqlite3@^11 && npm install -D @types/better-sqlite3@^7`
Expected: added. (better-sqlite3 compiles a native binding on install.)

- [ ] **Step 2: Create the schema**

`lib/db/schema.ts`:

```ts
import type Database from 'better-sqlite3';

export type DB = Database.Database;

export const SCHEMA = `
CREATE TABLE concepts (
  path TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  resource TEXT,
  timestamp TEXT,
  frontmatter_json TEXT NOT NULL,
  body_md TEXT NOT NULL,
  body_html TEXT NOT NULL,
  parse_error TEXT
);
CREATE TABLE tags (concept_path TEXT NOT NULL, tag TEXT NOT NULL);
CREATE INDEX idx_tags_tag ON tags(tag);
CREATE INDEX idx_tags_concept ON tags(concept_path);
CREATE TABLE links (
  src_path TEXT NOT NULL,
  dst_path TEXT,
  dst_raw TEXT NOT NULL,
  resolved INTEGER NOT NULL,
  external INTEGER NOT NULL
);
CREATE INDEX idx_links_src ON links(src_path);
CREATE INDEX idx_links_dst ON links(dst_path);
CREATE VIRTUAL TABLE concepts_fts USING fts5(
  path UNINDEXED, title, description, body, tags
);
CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT);
`;

export function initSchema(db: DB): void {
  db.exec(SCHEMA);
}
```

- [ ] **Step 3: Write the failing test**

`lib/db/build.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildBundle } from '../okf-core/bundle';
import type { RawFile } from '../okf-core/types';
import { buildIndex } from './build';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\ntitle: Orders\ntags: [sales]\n---\nBody [c](customers.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\ntitle: Customers\n---\n# Customers\nText.' },
];

function freshDb() {
  const db = new Database(':memory:');
  buildIndex(db, buildBundle(FILES));
  return db;
}

describe('buildIndex', () => {
  it('inserts one row per concept with rendered HTML', () => {
    const db = freshDb();
    const row = db.prepare('SELECT * FROM concepts WHERE path = ?').get('tables/customers.md') as any;
    expect(row.type).toBe('Table');
    expect(row.title).toBe('Customers');
    expect(JSON.parse(row.frontmatter_json).title).toBe('Customers');
    expect(row.body_html).toContain('<h1>Customers</h1>');
  });

  it('inserts tags and links', () => {
    const db = freshDb();
    const tag = db.prepare('SELECT tag FROM tags WHERE concept_path = ?').get('tables/orders.md') as any;
    expect(tag.tag).toBe('sales');
    const link = db.prepare('SELECT * FROM links WHERE src_path = ?').get('tables/orders.md') as any;
    expect(link.dst_path).toBe('tables/customers.md');
    expect(link.resolved).toBe(1);
  });

  it('populates the FTS index so MATCH works', () => {
    const db = freshDb();
    const hit = db.prepare("SELECT path FROM concepts_fts WHERE concepts_fts MATCH 'orders'").get() as any;
    expect(hit.path).toBe('tables/orders.md');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- db/build`
Expected: FAIL — cannot resolve `./build`.

- [ ] **Step 5: Write minimal implementation**

`lib/db/build.ts`:

```ts
import { renderMarkdown } from '../okf-core/render';
import type { Bundle } from '../okf-core/types';
import { initSchema, type DB } from './schema';

export function buildIndex(db: DB, bundle: Bundle): void {
  initSchema(db);

  const insertConcept = db.prepare(`
    INSERT INTO concepts (path, type, title, description, resource, timestamp, frontmatter_json, body_md, body_html, parse_error)
    VALUES (@path, @type, @title, @description, @resource, @timestamp, @frontmatter_json, @body_md, @body_html, @parse_error)
  `);
  const insertTag = db.prepare('INSERT INTO tags (concept_path, tag) VALUES (?, ?)');
  const insertLink = db.prepare(
    'INSERT INTO links (src_path, dst_path, dst_raw, resolved, external) VALUES (?, ?, ?, ?, ?)',
  );
  const insertFts = db.prepare(
    'INSERT INTO concepts_fts (path, title, description, body, tags) VALUES (?, ?, ?, ?, ?)',
  );

  const tx = db.transaction(() => {
    for (const c of bundle.concepts) {
      const html = c.parseError ? '' : renderMarkdown(c.body);
      insertConcept.run({
        path: c.path,
        type: c.type,
        title: c.title ?? null,
        description: c.description ?? null,
        resource: c.resource ?? null,
        timestamp: c.timestamp ?? null,
        frontmatter_json: JSON.stringify(c.frontmatter),
        body_md: c.body,
        body_html: html,
        parse_error: c.parseError ?? null,
      });
      for (const tag of c.tags) insertTag.run(c.path, tag);
      insertFts.run(c.path, c.title ?? '', c.description ?? '', c.body, c.tags.join(' '));
    }
    for (const l of bundle.links) {
      insertLink.run(l.from, l.to ?? null, l.toRaw, l.resolved ? 1 : 0, l.external ? 1 : 0);
    }
  });

  tx();
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- db/build`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/build.ts lib/db/build.test.ts package.json package-lock.json
git commit -m "feat(db): build a SQLite index with FTS5 from a bundle"
```

---

### Task 10: Index queries (get, list, search, graph, backlinks)

**Files:**
- Create: `lib/db/queries.ts`
- Test: `lib/db/queries.test.ts`

**Interfaces:**
- Consumes: `DB` (Task 9), an index built by `buildIndex`.
- Produces:
  - `interface ConceptSummary { path: string; type: string; title: string | null }`
  - `interface SearchHit extends ConceptSummary { snippet: string }`
  - `interface GraphData { nodes: ConceptSummary[]; edges: { from: string; to: string }[] }`
  - `function getConcept(db: DB, path: string): ConceptRow | undefined`
  - `function listConcepts(db: DB, opts?: { type?: string; tag?: string }): ConceptSummary[]`
  - `function searchConcepts(db: DB, query: string): SearchHit[]`
  - `function backlinks(db: DB, path: string): ConceptSummary[]`
  - `function graphNeighborhood(db: DB, path: string, depth?: number): GraphData`

- [ ] **Step 1: Write the failing test**

`lib/db/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildBundle } from '../okf-core/bundle';
import type { RawFile } from '../okf-core/types';
import { buildIndex } from './build';
import { getConcept, listConcepts, searchConcepts, backlinks, graphNeighborhood } from './queries';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\ntitle: Orders\ntags: [sales]\n---\nOrders link to [c](customers.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\ntitle: Customers\ntags: [sales]\n---\nCustomers data.' },
  { path: 'metrics/wau.md', content: '---\ntype: Metric\ntitle: WAU\ntags: [engagement]\n---\nUses [orders](../tables/orders.md).' },
];

function db() {
  const d = new Database(':memory:');
  buildIndex(d, buildBundle(FILES));
  return d;
}

describe('queries', () => {
  it('getConcept returns a single concept with html', () => {
    const c = getConcept(db(), 'tables/orders.md');
    expect(c?.title).toBe('Orders');
    expect(c?.body_html).toContain('<p>');
  });

  it('listConcepts filters by type and by tag', () => {
    const d = db();
    expect(listConcepts(d, { type: 'Table' }).map((c) => c.path).sort()).toEqual([
      'tables/customers.md',
      'tables/orders.md',
    ]);
    expect(listConcepts(d, { tag: 'engagement' }).map((c) => c.path)).toEqual(['metrics/wau.md']);
  });

  it('searchConcepts finds concepts by full-text match with a snippet', () => {
    const hits = searchConcepts(db(), 'customers');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.snippet).toBeTruthy();
  });

  it('searchConcepts returns [] for an empty query', () => {
    expect(searchConcepts(db(), '   ')).toEqual([]);
  });

  it('backlinks returns concepts that link to a target', () => {
    const back = backlinks(db(), 'tables/orders.md').map((c) => c.path);
    expect(back).toContain('metrics/wau.md');
  });

  it('graphNeighborhood returns the node and its immediate neighbors', () => {
    const g = graphNeighborhood(db(), 'tables/orders.md', 1);
    const ids = g.nodes.map((n) => n.path).sort();
    expect(ids).toContain('tables/orders.md');
    expect(ids).toContain('tables/customers.md');
    expect(ids).toContain('metrics/wau.md');
    expect(g.edges.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db/queries`
Expected: FAIL — cannot resolve `./queries`.

- [ ] **Step 3: Write minimal implementation**

`lib/db/queries.ts`:

```ts
import type { DB } from './schema';

export interface ConceptRow {
  path: string;
  type: string;
  title: string | null;
  description: string | null;
  resource: string | null;
  timestamp: string | null;
  frontmatter_json: string;
  body_md: string;
  body_html: string;
  parse_error: string | null;
}

export interface ConceptSummary {
  path: string;
  type: string;
  title: string | null;
}

export interface SearchHit extends ConceptSummary {
  snippet: string;
}

export interface GraphData {
  nodes: ConceptSummary[];
  edges: { from: string; to: string }[];
}

export function getConcept(db: DB, path: string): ConceptRow | undefined {
  return db.prepare('SELECT * FROM concepts WHERE path = ?').get(path) as ConceptRow | undefined;
}

export function listConcepts(db: DB, opts: { type?: string; tag?: string } = {}): ConceptSummary[] {
  if (opts.tag) {
    return db
      .prepare(
        `SELECT c.path, c.type, c.title FROM concepts c
         JOIN tags t ON t.concept_path = c.path
         WHERE t.tag = ?${opts.type ? ' AND c.type = ?' : ''}
         ORDER BY c.path`,
      )
      .all(...(opts.type ? [opts.tag, opts.type] : [opts.tag])) as ConceptSummary[];
  }
  if (opts.type) {
    return db
      .prepare('SELECT path, type, title FROM concepts WHERE type = ? ORDER BY path')
      .all(opts.type) as ConceptSummary[];
  }
  return db.prepare('SELECT path, type, title FROM concepts ORDER BY path').all() as ConceptSummary[];
}

function toMatchQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' ');
}

export function searchConcepts(db: DB, query: string): SearchHit[] {
  const match = toMatchQuery(query);
  if (!match) return [];
  return db
    .prepare(
      `SELECT c.path, c.type, c.title,
              snippet(concepts_fts, 3, '<mark>', '</mark>', '…', 12) AS snippet
       FROM concepts_fts
       JOIN concepts c ON c.path = concepts_fts.path
       WHERE concepts_fts MATCH ?
       ORDER BY bm25(concepts_fts)`,
    )
    .all(match) as SearchHit[];
}

export function backlinks(db: DB, path: string): ConceptSummary[] {
  return db
    .prepare(
      `SELECT c.path, c.type, c.title FROM links l
       JOIN concepts c ON c.path = l.src_path
       WHERE l.dst_path = ? ORDER BY c.path`,
    )
    .all(path) as ConceptSummary[];
}

export function graphNeighborhood(db: DB, path: string, depth = 1): GraphData {
  const visited = new Set<string>([path]);
  let frontier = [path];
  const edges: { from: string; to: string }[] = [];
  const edgeStmt = db.prepare(
    'SELECT src_path, dst_path FROM links WHERE resolved = 1 AND (src_path = ? OR dst_path = ?)',
  );

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      const rows = edgeStmt.all(node, node) as { src_path: string; dst_path: string }[];
      for (const r of rows) {
        edges.push({ from: r.src_path, to: r.dst_path });
        for (const neighbor of [r.src_path, r.dst_path]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
    }
    frontier = next;
  }

  const nodes = visited.size
    ? (db
        .prepare(
          `SELECT path, type, title FROM concepts
           WHERE path IN (${Array.from(visited).map(() => '?').join(',')})`,
        )
        .all(...visited) as ConceptSummary[])
    : [];

  // de-duplicate edges
  const seen = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.from} ${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, edges: uniqueEdges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- db/queries`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts lib/db/queries.test.ts
git commit -m "feat(db): get/list/search/backlinks/graph queries over the index"
```

---

### Task 11: `OkfService` — load + index + query wiring

**Files:**
- Create: `lib/okf-service.ts`
- Test: `lib/okf-service.test.ts`

**Interfaces:**
- Consumes: `readBundleFromDir` (Task 8), `buildBundle` (Task 6), `buildIndex` (Task 9), all queries (Task 10).
- Produces:
  - `interface OkfService { concepts(): ConceptSummary[]; concept(path): ConceptRow | undefined; search(q): SearchHit[]; backlinks(path): ConceptSummary[]; graph(path, depth?): GraphData; issues(): ValidationIssue[]; close(): void }`
  - `async function createService(dir: string): Promise<OkfService>`

- [ ] **Step 1: Write the failing test**

`lib/okf-service.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { createService } from './okf-service';

const EXAMPLE = join(process.cwd(), 'bundles/example');

describe('createService (on the example bundle)', () => {
  it('loads, indexes, and answers queries end-to-end', async () => {
    const svc = await createService(EXAMPLE);
    try {
      expect(svc.concepts().length).toBe(5);
      expect(svc.concept('tables/orders.md')?.title).toBe('Orders');
      expect(svc.search('orders').length).toBeGreaterThan(0);
      expect(svc.backlinks('tables/orders.md').map((c) => c.path)).toContain(
        'metrics/weekly_active_users.md',
      );
      expect(svc.graph('tables/orders.md', 1).nodes.length).toBeGreaterThan(1);
      expect(svc.issues().filter((i) => i.severity === 'error')).toEqual([]);
    } finally {
      svc.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- okf-service`
Expected: FAIL — cannot resolve `./okf-service`.

- [ ] **Step 3: Write minimal implementation**

`lib/okf-service.ts`:

```ts
import Database from 'better-sqlite3';
import { readBundleFromDir } from './bundle-loader';
import { buildBundle } from './okf-core/bundle';
import type { ValidationIssue } from './okf-core/types';
import { buildIndex } from './db/build';
import {
  getConcept,
  listConcepts,
  searchConcepts,
  backlinks,
  graphNeighborhood,
  type ConceptRow,
  type ConceptSummary,
  type SearchHit,
  type GraphData,
} from './db/queries';

export interface OkfService {
  concepts(opts?: { type?: string; tag?: string }): ConceptSummary[];
  concept(path: string): ConceptRow | undefined;
  search(query: string): SearchHit[];
  backlinks(path: string): ConceptSummary[];
  graph(path: string, depth?: number): GraphData;
  issues(): ValidationIssue[];
  close(): void;
}

export async function createService(dir: string): Promise<OkfService> {
  const files = await readBundleFromDir(dir);
  const bundle = buildBundle(files);
  const db = new Database(':memory:');
  buildIndex(db, bundle);

  return {
    concepts: (opts) => listConcepts(db, opts),
    concept: (path) => getConcept(db, path),
    search: (query) => searchConcepts(db, query),
    backlinks: (path) => backlinks(db, path),
    graph: (path, depth) => graphNeighborhood(db, path, depth),
    issues: () => bundle.issues,
    close: () => db.close(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- okf-service` then `npm run typecheck`
Expected: PASS (1 test); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/okf-service.ts lib/okf-service.test.ts
git commit -m "feat: OkfService wiring loader + index + queries"
```

---

### Task 12: `okf` CLI (`validate`, `index`, `query`)

**Files:**
- Create: `scripts/okf.ts`
- Test: `scripts/okf.test.ts`
- Modify: `README.md` (add a short "CLI" usage section)

**Interfaces:**
- Consumes: `readBundleFromDir`, `buildBundle`, `buildIndex`, `createService`.
- Produces:
  - `async function runValidate(dir: string, log?: (s: string) => void): Promise<number>` (exit code: 1 if any error-severity issue, else 0)
  - `async function runQuery(dir: string, query: string, log?: (s: string) => void): Promise<number>`
  - `async function runIndex(dir: string, outFile: string, log?: (s: string) => void): Promise<number>`
  - `async function main(argv: string[]): Promise<number>`

- [ ] **Step 1: Write the failing test**

`scripts/okf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runValidate, runQuery } from './okf';

const EXAMPLE = join(process.cwd(), 'bundles/example');

async function tmpBundle(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'okf-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return dir;
}

describe('okf CLI', () => {
  it('validate exits 0 on the clean example bundle', async () => {
    const lines: string[] = [];
    const code = await runValidate(EXAMPLE, (s) => lines.push(s));
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/ok|0 error/i);
  });

  it('validate exits 1 when a concept is missing its type', async () => {
    const dir = await tmpBundle({ 'a.md': '---\ntitle: no type\n---\nbody' });
    const code = await runValidate(dir, () => {});
    expect(code).toBe(1);
  });

  it('query prints matching concept paths', async () => {
    const lines: string[] = [];
    const code = await runQuery(EXAMPLE, 'orders', (s) => lines.push(s));
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('tables/orders.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scripts/okf`
Expected: FAIL — cannot resolve `./okf`.

- [ ] **Step 3: Write minimal implementation**

`scripts/okf.ts`:

```ts
import Database from 'better-sqlite3';
import { readBundleFromDir } from '../lib/bundle-loader';
import { buildBundle } from '../lib/okf-core/bundle';
import { buildIndex } from '../lib/db/build';
import { createService } from '../lib/okf-service';

type Logger = (line: string) => void;
const stdout: Logger = (line) => process.stdout.write(line + '\n');

export async function runValidate(dir: string, log: Logger = stdout): Promise<number> {
  const bundle = buildBundle(await readBundleFromDir(dir));
  const errors = bundle.issues.filter((i) => i.severity === 'error');
  const warnings = bundle.issues.filter((i) => i.severity === 'warning');
  for (const issue of bundle.issues) {
    log(`${issue.severity.toUpperCase()} ${issue.path}${issue.field ? ` [${issue.field}]` : ''}: ${issue.message}`);
  }
  log(`${errors.length} error(s), ${warnings.length} warning(s) across ${bundle.concepts.length} concept(s)`);
  if (errors.length === 0) log('ok');
  return errors.length > 0 ? 1 : 0;
}

export async function runQuery(dir: string, query: string, log: Logger = stdout): Promise<number> {
  const svc = await createService(dir);
  try {
    const hits = svc.search(query);
    if (hits.length === 0) {
      log('(no matches)');
      return 0;
    }
    for (const hit of hits) log(`${hit.path}  —  ${hit.title ?? hit.type}`);
    return 0;
  } finally {
    svc.close();
  }
}

export async function runIndex(dir: string, outFile: string, log: Logger = stdout): Promise<number> {
  const bundle = buildBundle(await readBundleFromDir(dir));
  const db = new Database(outFile);
  buildIndex(db, bundle);
  db.close();
  log(`indexed ${bundle.concepts.length} concept(s) -> ${outFile}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'validate':
      if (!rest[0]) return usage('validate <bundle-dir>');
      return runValidate(rest[0]);
    case 'query':
      if (!rest[0] || !rest[1]) return usage('query <bundle-dir> <terms...>');
      return runQuery(rest[0], rest.slice(1).join(' '));
    case 'index':
      if (!rest[0] || !rest[1]) return usage('index <bundle-dir> <out.sqlite>');
      return runIndex(rest[0], rest[1]);
    default:
      return usage('<validate|query|index> ...');
  }
}

function usage(msg: string): number {
  process.stderr.write(`usage: okf ${msg}\n`);
  return 2;
}

// Run only when invoked directly (e.g. `tsx scripts/okf.ts ...`), not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('okf.ts')) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scripts/okf`
Expected: PASS (3 tests).

- [ ] **Step 5: Smoke-test the CLI by hand**

Run: `npm run okf -- validate bundles/example`
Expected: prints `0 error(s) ...` and `ok`, exit code 0.
Run: `npm run okf -- query bundles/example orders`
Expected: prints `tables/orders.md  —  Orders`.

- [ ] **Step 6: Add a CLI section to the README**

Insert after the "How it works" section in `README.md`:

```markdown
## CLI (development)

```bash
npm install
npm run okf -- validate bundles/example   # validate an OKF bundle (exit 1 on errors)
npm run okf -- query bundles/example orders  # full-text search
npm run okf -- index bundles/example okf.sqlite  # build a SQLite index file
```
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL tests pass; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add scripts/okf.ts scripts/okf.test.ts README.md
git commit -m "feat: okf CLI with validate/query/index commands"
```

---

## Self-Review

**Spec coverage (against `2026-06-29-okf-hub-design.md`):**

- §6 Data model — `Concept` incl. arbitrary `frontmatter` (Task 2), `Link`/graph (Tasks 4, 10), `Bundle` (Task 6), SQLite schema `concepts` (incl. `frontmatter_json`)/`tags`/`links`/`concepts_fts`/`sync_state` (Task 9). ✓ (`sync_state` table is created now; populated in M3 sync.) **Deferred to M1b:** the special handling of `index.md` (navigation) and `log.md` (chronological history) — these are read-path/UI surfaces, so M1a indexes them as ordinary concepts and the navigation/history treatment lands with the web UI.
- §9 Validation rules — `type` required, `tags` list, `timestamp` ISO-8601, `resource` URL, link resolution, parse-error isolation (Tasks 3, 6). ✓ Reused by CLI `validate` (Task 12) → serves the spec's "CI with okf-validate" requirement.
- §10 Error handling — parse errors isolated per concept, index regenerable (Tasks 2, 6, 9). ✓
- §11 Testing — `okf-core` unit tests, integration index build, sample bundle (`bundles/example`). ✓
- §8 Key flows (Browse / Search / Graph) **read path** — data layer (`getConcept`, `searchConcepts`, `graphNeighborhood`, `backlinks`) implemented (Tasks 10–11); the **web UI** rendering of these is intentionally deferred to the next plan (M1b). ✓ (documented scope boundary)
- Out of scope here (correctly deferred): auth, edit→PR, MCP/REST, git sync, Docker — these are M2/M3.

**Placeholder scan:** No TBD/TODO; every code step has complete code; no "add error handling" hand-waving (validation and parse-error handling are concrete). ✓

**Type consistency:** `Concept`, `Link`, `Bundle`, `ValidationIssue`, `RawFile` defined in `types.ts` and consumed unchanged downstream. `DB = Database.Database` defined once in `schema.ts`, imported by `build.ts`/`queries.ts`. Query return types (`ConceptRow`, `ConceptSummary`, `SearchHit`, `GraphData`) defined in `queries.ts` and re-exported through `OkfService`. `buildIndex(db, bundle)`, `searchConcepts(db, query)`, `graphNeighborhood(db, path, depth)` signatures match across tasks. ✓

---

## Execution Handoff

Implement with **superpowers:subagent-driven-development** (recommended) or **superpowers:executing-plans**. The next plan (M1b) adds the Next.js read-path UI (concept view, search page, graph explorer) on top of `OkfService`.
