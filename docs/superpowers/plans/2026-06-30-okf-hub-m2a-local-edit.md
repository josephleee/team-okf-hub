# OKF Hub — M2a: Local Edit, Validate & Sanitize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a team member edit an OKF concept in the browser with live validation, see a sanitized preview, and **save directly to the local bundle `.md` file** (the user then commits with git). Also harden rendering against untrusted content (the recorded M2 security prerequisite).

**Architecture:** A `'use client'` editor (raw Markdown textarea) calls two **server actions** — `validateAction` (debounced, returns issues + a sanitized HTML preview) and `saveAction` (validates, writes the file, invalidates the in-memory index). The actions are passed into the editor as props so the component stays unit-testable without pulling in server-only code. Pure edit logic lives in `lib/edit-ops.ts`; filesystem writes (with path-traversal safety) live in `lib/bundle-io.ts`. Rendering gains `rehype-sanitize`, and search snippets are HTML-escaped (only our `<mark>` markers survive).

**Tech Stack:** Next.js 15 Server Actions + React 19 client component · TypeScript (ESM) · unified/rehype-sanitize · existing `okf-core` (parse/validate/links/render) and `OkfService`. Builds on M1a/M1b (all on `main`).

## Global Constraints

- **Node ≥ 20**, ESM (`"type":"module"`), TypeScript `strict` + `noUncheckedIndexedAccess`. Relative imports WITHOUT extensions (`moduleResolution: "Bundler"`).
- **git is the source of truth.** Save writes the bundle file on disk; the **user commits with git** (no auto-commit/PR in this milestone). The SQLite index is rebuilt after a save.
- **Security (the reason for this milestone's sanitization):** once users can write content, `body_html` and search snippets must be safe. Body HTML is sanitized with `rehype-sanitize`; snippets are HTML-escaped except the `<mark>` markers.
- **Path safety:** a save/read path comes from the URL and MUST resolve inside the bundle dir and end in `.md`; reject traversal (`../`) or non-markdown.
- **Save gating:** a concept with an **error-severity** issue (missing `type`, invalid YAML, `tags` not a list) cannot be saved; warnings (broken links, non-ISO timestamp, bad URL) do not block.
- **Server-only isolation:** `app/lib/service.ts` (`import 'server-only'`) and `app/lib/actions.ts` (`'use server'`) are only imported by Server Components. The client editor receives the actions as props and imports only TYPES from `okf-core`.
- **Reuse, don't reimplement:** validation/links/render come from `okf-core`; the bundle dir comes from `OKF_BUNDLE_DIR` (default `bundles/example`), same as M1b.
- **Commit identity** preconfigured (`Joseph <jungsup@kakao.com>`); normal `git commit`, append the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (blank line before it).

## File Structure

```
lib/okf-core/render.ts        # + rehype-sanitize
lib/db/queries.ts             # snippet markers → sentinels; export SNIPPET_OPEN/CLOSE
lib/bundle-io.ts              # NEW: resolveBundlePath, readConceptSource, writeConceptSource
lib/edit-ops.ts               # NEW: validateContent (pure), saveContent (writes)
app/lib/data.ts               # + escapeSnippet; searchView escapes snippets
app/lib/service.ts            # + resetService()
app/lib/actions.ts            # NEW ('use server'): validateAction, saveAction
app/components/concept-editor.tsx   # NEW ('use client'): editor UI
app/components/concept-detail.tsx   # + optional editHref (Edit link)
app/concept/[...path]/edit/page.tsx # NEW: edit route
app/concept/[...path]/page.tsx      # pass editHref
app/concept/new/page.tsx            # NEW: create-concept route
app/globals.css               # editor styles
```

---

### Task 1: Sanitize rendered Markdown HTML

**Files:**
- Modify: `lib/okf-core/render.ts`
- Test: `lib/okf-core/render.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderMarkdown(body)` now returns sanitized HTML (dangerous tags/attributes and `javascript:`/`data:` URLs removed; GFM tables, code, and safe links preserved).

- [ ] **Step 1: Install dependency**

Run: `npm install rehype-sanitize@^6`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test** (append to `lib/okf-core/render.test.ts`)

```ts
describe('renderMarkdown sanitization', () => {
  it('strips javascript: link URLs but keeps the link text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
  });

  it('keeps GFM tables and code after sanitizing', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | `x` |');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>x</code>');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- render`
Expected: FAIL — the `javascript:` test fails (current pipeline keeps the `javascript:` href).

- [ ] **Step 4: Add `rehype-sanitize` to the pipeline** (`lib/okf-core/render.ts`)

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize) // strip dangerous tags/attrs and unsafe URL schemes (default GitHub schema)
  .use(rehypeStringify);

export function renderMarkdown(body: string): string {
  return String(processor.processSync(body));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- render`
Expected: PASS (existing heading/strong/table/empty tests still pass; the 2 new sanitization tests pass).

- [ ] **Step 6: Commit**

```bash
git add lib/okf-core/render.ts lib/okf-core/render.test.ts package.json package-lock.json
git commit -m "feat(core): sanitize rendered Markdown (rehype-sanitize)"
```

---

### Task 2: HTML-escape search snippets

**Files:**
- Modify: `lib/db/queries.ts` (snippet markers → sentinels + export them)
- Modify: `app/lib/data.ts` (escape snippets in `searchView`; export `escapeSnippet`)
- Test: `app/lib/data.test.ts`

**Interfaces:**
- Consumes: `SearchHit.snippet` (now contains sentinel markers ``/`` around matches instead of literal `<mark>`).
- Produces:
  - `const SNIPPET_OPEN = ''`, `const SNIPPET_CLOSE = ''` (exported from `lib/db/queries.ts`).
  - `function escapeSnippet(raw: string): string` (exported from `app/lib/data.ts`) — HTML-escapes `&<>` then turns the sentinels into `<mark>`/`</mark>`.
  - `searchView(...).hits[].snippet` is now safe HTML.

- [ ] **Step 1: Change the FTS snippet markers to sentinels** (`lib/db/queries.ts`)

Add near the top of the file (after imports):

```ts
export const SNIPPET_OPEN = '';
export const SNIPPET_CLOSE = '';
```

In `searchConcepts`, change the `snippet(...)` call so the markers are the sentinel control chars (`char(2)`/`char(3)`) instead of literal `<mark>` tags:

```ts
  return db
    .prepare(
      `SELECT c.path, c.type, c.title,
              snippet(concepts_fts, 3, char(2), char(3), '…', 12) AS snippet
       FROM concepts_fts
       JOIN concepts c ON c.path = concepts_fts.path
       WHERE concepts_fts MATCH ?
       ORDER BY bm25(concepts_fts)`,
    )
    .all(match) as SearchHit[];
```

- [ ] **Step 2: Write the failing test** (append to `app/lib/data.test.ts`)

```ts
import { escapeSnippet } from './data';

describe('escapeSnippet', () => {
  it('escapes HTML in snippet text but turns the sentinel markers into <mark>', () => {
    const raw = 'a <b> hit & c';
    expect(escapeSnippet(raw)).toBe('a &lt;b&gt; <mark>hit</mark> &amp; c');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- app/lib/data`
Expected: FAIL — `escapeSnippet` is not exported.

- [ ] **Step 4: Implement `escapeSnippet` and use it in `searchView`** (`app/lib/data.ts`)

Add the import of the sentinels and the helper near the top (after the existing imports):

```ts
import { SNIPPET_OPEN, SNIPPET_CLOSE } from '../../lib/db/queries';

export function escapeSnippet(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(SNIPPET_OPEN).join('<mark>')
    .split(SNIPPET_CLOSE).join('</mark>');
}
```

Then in `searchView`, escape the snippet:

```ts
export function searchView(svc: OkfService, query: string): SearchView {
  const hits = svc.search(query).map((h) => ({
    path: h.path,
    title: titleOf(h.path, h.title),
    type: h.type,
    snippet: escapeSnippet(h.snippet),
  }));
  return { query, hits };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- app/lib/data` and `npm test -- db/queries`
Expected: PASS (the existing `searchView`/`searchConcepts` tests still pass — snippet is still a non-empty string; the new `escapeSnippet` test passes).

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts app/lib/data.ts app/lib/data.test.ts
git commit -m "feat(web): HTML-escape search snippets (keep <mark>)"
```

---

### Task 3: `bundle-io` — path-safe read/write of concept files

**Files:**
- Create: `lib/bundle-io.ts`
- Test: `lib/bundle-io.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function resolveBundlePath(dir: string, path: string): string` — absolute path; throws if it escapes `dir` or isn't `.md`.
  - `async function readConceptSource(dir: string, path: string): Promise<string>`
  - `async function writeConceptSource(dir: string, path: string, content: string): Promise<void>` (creates parent dirs).

- [ ] **Step 1: Write the failing test** (`lib/bundle-io.test.ts`)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBundlePath, readConceptSource, writeConceptSource } from './bundle-io';

const dir = await mkdtemp(join(tmpdir(), 'okf-io-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('bundle-io', () => {
  it('writes then reads a concept source file', async () => {
    await writeConceptSource(dir, 'tables/orders.md', '---\ntype: Table\n---\nhi');
    expect(await readConceptSource(dir, 'tables/orders.md')).toContain('type: Table');
  });

  it('rejects path traversal outside the bundle', () => {
    expect(() => resolveBundlePath(dir, '../escape.md')).toThrow();
    expect(() => resolveBundlePath(dir, '/etc/passwd')).toThrow();
  });

  it('rejects non-markdown paths', () => {
    expect(() => resolveBundlePath(dir, 'tables/orders.txt')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bundle-io`
Expected: FAIL — cannot resolve `./bundle-io`.

- [ ] **Step 3: Implement `lib/bundle-io.ts`**

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';

export function resolveBundlePath(dir: string, path: string): string {
  const base = resolve(dir);
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error(`path escapes the bundle: ${path}`);
  }
  if (!full.endsWith('.md')) {
    throw new Error(`not a markdown file: ${path}`);
  }
  return full;
}

export async function readConceptSource(dir: string, path: string): Promise<string> {
  return readFile(resolveBundlePath(dir, path), 'utf8');
}

export async function writeConceptSource(dir: string, path: string, content: string): Promise<void> {
  const full = resolveBundlePath(dir, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bundle-io`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/bundle-io.ts lib/bundle-io.test.ts
git commit -m "feat: path-safe concept file read/write"
```

---

### Task 4: `edit-ops` — validate content & save content

**Files:**
- Create: `lib/edit-ops.ts`
- Test: `lib/edit-ops.test.ts`

**Interfaces:**
- Consumes: `parseConcept`, `validateConcept`, `extractLinks`, `renderMarkdown` (okf-core), `writeConceptSource` (Task 3), `ValidationIssue`.
- Produces:
  - `function validateContent(path: string, content: string, knownPaths: Set<string>): { issues: ValidationIssue[]; html: string }` — pure; parses, validates fields, checks internal links against `knownPaths`, renders a sanitized HTML preview (empty string if the frontmatter failed to parse).
  - `async function saveContent(dir: string, path: string, content: string, knownPaths: Set<string>): Promise<{ ok: boolean; issues: ValidationIssue[] }>` — validates; writes only if there are no error-severity issues.

- [ ] **Step 1: Write the failing test** (`lib/edit-ops.test.ts`)

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContent, saveContent } from './edit-ops';

const known = new Set(['tables/orders.md', 'tables/customers.md']);
const dir = await mkdtemp(join(tmpdir(), 'okf-edit-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('validateContent', () => {
  it('reports a missing-type error and renders no html on parse error', () => {
    const r = validateContent('x.md', '---\ntitle: no type\n---\nhi', known);
    expect(r.issues.some((i) => i.severity === 'error' && i.field === 'type')).toBe(true);
  });

  it('renders sanitized html and flags a broken internal link as a warning', () => {
    const r = validateContent('tables/orders.md', '---\ntype: Table\n---\n# H\nLink [x](ghost.md).', known);
    expect(r.html).toContain('<h1>H</h1>');
    expect(r.issues.some((i) => i.severity === 'warning' && i.field === 'link')).toBe(true);
  });
});

describe('saveContent', () => {
  it('writes the file when there are no errors', async () => {
    const r = await saveContent(dir, 'tables/orders.md', '---\ntype: Table\ntitle: Orders\n---\nbody', known);
    expect(r.ok).toBe(true);
    expect(await readFile(join(dir, 'tables/orders.md'), 'utf8')).toContain('title: Orders');
  });

  it('does NOT write when there is an error', async () => {
    const r = await saveContent(dir, 'bad.md', '---\ntitle: no type\n---\nx', known);
    expect(r.ok).toBe(false);
    await expect(readFile(join(dir, 'bad.md'), 'utf8')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- edit-ops`
Expected: FAIL — cannot resolve `./edit-ops`.

- [ ] **Step 3: Implement `lib/edit-ops.ts`**

```ts
import { parseConcept } from './okf-core/parse';
import { validateConcept } from './okf-core/validate';
import { extractLinks } from './okf-core/links';
import { renderMarkdown } from './okf-core/render';
import type { ValidationIssue } from './okf-core/types';
import { writeConceptSource } from './bundle-io';

export function validateContent(
  path: string,
  content: string,
  knownPaths: Set<string>,
): { issues: ValidationIssue[]; html: string } {
  const concept = parseConcept(path, content);
  const issues = validateConcept(concept);
  let html = '';
  if (!concept.parseError) {
    html = renderMarkdown(concept.body);
    for (const link of extractLinks(path, concept.body, knownPaths)) {
      if (!link.external && !link.resolved) {
        issues.push({ path, severity: 'warning', field: 'link', message: `Broken link: ${link.toRaw}` });
      }
    }
  }
  return { issues, html };
}

export async function saveContent(
  dir: string,
  path: string,
  content: string,
  knownPaths: Set<string>,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const { issues } = validateContent(path, content, knownPaths);
  if (issues.some((i) => i.severity === 'error')) {
    return { ok: false, issues };
  }
  await writeConceptSource(dir, path, content);
  return { ok: true, issues };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- edit-ops`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/edit-ops.ts lib/edit-ops.test.ts
git commit -m "feat: validate and save concept content"
```

---

### Task 5: `resetService` — invalidate the in-memory index after a save

**Files:**
- Modify: `app/lib/service.ts`
- Test: `app/lib/service-reset.test.ts`

**Interfaces:**
- Consumes: the `getService` singleton cache.
- Produces: `function resetService(): void` — clears the cached service (closing the old DB) so the next `getService()` rebuilds from disk.

- [ ] **Step 1: Write the failing test** (`app/lib/service-reset.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { getService, resetService } from './service';

describe('resetService', () => {
  it('returns a fresh service instance after reset', async () => {
    process.env.OKF_BUNDLE_DIR = join(process.cwd(), 'bundles/example');
    const a = await getService();
    resetService();
    const b = await getService();
    expect(b).not.toBe(a);
    a.close?.();
    b.close?.();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- service-reset`
Expected: FAIL — `resetService` is not exported.

- [ ] **Step 3: Implement `resetService`** (append to `app/lib/service.ts`)

```ts
export function resetService(): void {
  const previous = cache.__okfService;
  cache.__okfService = undefined;
  if (previous) {
    previous.then((svc) => svc.close()).catch(() => {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- service-reset` then `npm run typecheck`
Expected: PASS; typecheck clean. (Note: `service.ts` imports `'server-only'`, which is a no-op in Node/Vitest.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/service.ts app/lib/service-reset.test.ts
git commit -m "feat(web): resetService() to rebuild the index after a save"
```

---

### Task 6: `ConceptEditor` — client editor component

**Files:**
- Create: `app/components/concept-editor.tsx`
- Test: `app/components/concept-editor.test.tsx`
- Modify: `app/globals.css` (editor styles)

**Interfaces:**
- Consumes: `ValidationIssue` (type only).
- Produces:
  - `type ValidateFn = (path: string, content: string) => Promise<{ issues: ValidationIssue[]; html: string }>`
  - `type SaveFn = (path: string, content: string) => Promise<{ ok: boolean; issues: ValidationIssue[] }>`
  - `function ConceptEditor(props: { path: string; initialContent: string; onValidate: ValidateFn; onSave: SaveFn }): JSX.Element`
  - The save action and live-validate function are **injected as props** (so the component never imports server-only code and stays unit-testable).

- [ ] **Step 1: Add editor styles** (append to `app/globals.css`)

```css
/* ---- Concept editor ---- */
.okf-editor { display: flex; gap: 20px; max-width: 1060px; margin: 0 auto; width: 100%; padding: 22px 34px 50px; }
.okf-editor__area { flex: 1; min-width: 0; min-height: 460px; resize: vertical; padding: 14px 16px; border: 1px solid var(--okf-border); border-radius: var(--okf-radius); background: var(--okf-card); color: var(--okf-ink); font: 13px/1.6 var(--okf-font-mono); }
.okf-editor__area:focus { outline: none; border-color: var(--okf-primary); box-shadow: var(--okf-focus-ring); }
.okf-editor__side { width: 320px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 14px; }
.okf-editor__saved { font: 400 12px var(--okf-font-mono); color: var(--okf-primary); margin: 0; }
.okf-issues { display: flex; flex-direction: column; gap: 6px; }
.okf-issue { font: 400 12px var(--okf-font-mono); padding: 5px 9px; border-radius: var(--okf-radius-sm); border: 1px solid var(--okf-border); }
.okf-issue.error { color: #b4232a; border-color: #f0c4c6; background: #fdf3f3; }
.okf-issue.warning { color: #8a6312; border-color: #efe0bd; background: #fdfaf2; }
.okf-editor__preview { border: 1px dashed var(--okf-border); border-radius: var(--okf-radius); padding: 12px 14px; max-height: 320px; overflow: auto; }
```

- [ ] **Step 2: Write the failing test** (`app/components/concept-editor.test.tsx`)

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConceptEditor } from './concept-editor';

afterEach(cleanup);

const okValidate = vi.fn(async () => ({ issues: [], html: '<p>preview</p>' }));

describe('ConceptEditor', () => {
  it('renders the initial content and a Save button', () => {
    render(<ConceptEditor path="x.md" initialContent="hello" onValidate={okValidate} onSave={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello');
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
  });

  it('disables Save and shows the error when validation reports an error', async () => {
    const onValidate = vi.fn(async () => ({
      issues: [{ path: 'x.md', severity: 'error' as const, field: 'type', message: '`type` is required' }],
      html: '',
    }));
    render(<ConceptEditor path="x.md" initialContent="bad" onValidate={onValidate} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/`type` is required/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onSave with the edited content', async () => {
    const onSave = vi.fn(async () => ({ ok: true, issues: [] }));
    render(<ConceptEditor path="x.md" initialContent="hi" onValidate={okValidate} onSave={onSave} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('x.md', 'edited'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- concept-editor`
Expected: FAIL — cannot resolve `./concept-editor`.

- [ ] **Step 4: Implement `app/components/concept-editor.tsx`**

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ValidationIssue } from '../../lib/okf-core/types';

export type ValidateFn = (path: string, content: string) => Promise<{ issues: ValidationIssue[]; html: string }>;
export type SaveFn = (path: string, content: string) => Promise<{ ok: boolean; issues: ValidationIssue[] }>;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="okf-issues">
      {issues.map((i, n) => (
        <div className={`okf-issue ${i.severity}`} key={n}>
          {i.severity.toUpperCase()}{i.field ? ` [${i.field}]` : ''}: {i.message}
        </div>
      ))}
    </div>
  );
}

export function ConceptEditor({
  path, initialContent, onValidate, onSave,
}: { path: string; initialContent: string; onValidate: ValidateFn; onSave: SaveFn }) {
  const [content, setContent] = useState(initialContent);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      onValidate(path, content).then((res) => {
        if (!active) return;
        setIssues(res.issues);
        setHtml(res.html);
      });
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [content, path, onValidate]);

  const hasError = issues.some((i) => i.severity === 'error');

  async function handleSave() {
    setSaving(true);
    setSaved('');
    const res = await onSave(path, content);
    setSaving(false);
    if (res.ok) {
      setSaved('Saved ✓ — commit with git to persist.');
      router.refresh();
    } else {
      setIssues(res.issues);
    }
  }

  return (
    <div className="okf-editor okf-screen">
      <textarea
        className="okf-editor__area"
        value={content}
        spellCheck={false}
        aria-label="Concept source"
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="okf-editor__side">
        <button className="okf-btn" type="button" onClick={handleSave} disabled={saving || hasError}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <p className="okf-editor__saved">{saved}</p>}
        <IssueList issues={issues} />
        {html && <div className="okf-editor__preview okf-prose" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- concept-editor` then `npm run typecheck`
Expected: PASS (3 tests); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/concept-editor.tsx app/components/concept-editor.test.tsx app/globals.css
git commit -m "feat(web): concept editor component with live validation + preview"
```

---

### Task 7: Server actions + edit route + Edit link

**Files:**
- Create: `app/lib/actions.ts`, `app/concept/[...path]/edit/page.tsx`
- Modify: `app/components/concept-detail.tsx` (optional `editHref`), `app/concept/[...path]/page.tsx` (pass `editHref`)

**Interfaces:**
- Consumes: `getService`, `resetService` (Task 5), `validateContent`, `saveContent` (Task 4), `readConceptSource` (Task 3), `ConceptEditor` (Task 6), `OKF_BUNDLE_DIR`.
- Produces: `validateAction`, `saveAction` (server actions matching `ValidateFn`/`SaveFn`); an `/concept/<path>/edit` route; an Edit link on the concept page.

- [ ] **Step 1: Create the server actions** (`app/lib/actions.ts`)

```ts
'use server';
import { getService, resetService } from './service';
import { validateContent, saveContent } from '../../lib/edit-ops';
import type { ValidationIssue } from '../../lib/okf-core/types';

const bundleDir = () => process.env.OKF_BUNDLE_DIR ?? 'bundles/example';

async function knownPaths(): Promise<Set<string>> {
  const svc = await getService();
  return new Set(svc.concepts().map((c) => c.path));
}

export async function validateAction(
  path: string,
  content: string,
): Promise<{ issues: ValidationIssue[]; html: string }> {
  return validateContent(path, content, await knownPaths());
}

export async function saveAction(
  path: string,
  content: string,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const result = await saveContent(bundleDir(), path, content, await knownPaths());
  if (result.ok) resetService();
  return result;
}
```

- [ ] **Step 2: Create the edit route** (`app/concept/[...path]/edit/page.tsx`)

```tsx
import { notFound } from 'next/navigation';
import { readConceptSource } from '../../../../lib/bundle-io';
import { ConceptEditor } from '../../../components/concept-editor';
import { validateAction, saveAction } from '../../../lib/actions';

export const dynamic = 'force-dynamic';

export default async function EditConceptPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const conceptPath = path.map(decodeURIComponent).join('/');
  let source: string;
  try {
    source = await readConceptSource(process.env.OKF_BUNDLE_DIR ?? 'bundles/example', conceptPath);
  } catch {
    notFound();
  }
  return (
    <main>
      <ConceptEditor path={conceptPath} initialContent={source} onValidate={validateAction} onSave={saveAction} />
    </main>
  );
}
```

- [ ] **Step 3: Add an Edit link to the concept page**

In `app/components/concept-detail.tsx`, extend the props and render an Edit link in the breadcrumb row. Change the signature and the breadcrumb block:

```tsx
export function ConceptDetail({ view, back, editHref }: { view: ConceptView; back?: ReactNode; editHref?: string }) {
```

and replace the breadcrumb element with:

```tsx
        <div className="okf-breadcrumb">
          <Link href="/">concepts</Link> / {view.title}
          {editHref && <> · <Link href={editHref}>edit</Link></>}
        </div>
```

In `app/concept/[...path]/page.tsx`, pass the href:

```tsx
  return <main><ConceptDetail view={view} back={<BackButton />} editHref={`/concept/${conceptPath}/edit`} /></main>;
```

- [ ] **Step 4: Build + typecheck + tests**

Run: `npm run build` (compiles the new `/concept/[...path]/edit` route + the server actions), `npm run typecheck` (clean), `npm test` (all pass — `concept-detail` test still passes since it renders without `editHref`).
Expected: build succeeds; typecheck clean; all tests pass.

- [ ] **Step 5: Manual smoke (controller / human)**

`npm run dev` → open `/concept/tables/orders.md` → click **edit** → change the description → the issue panel stays clean and the preview updates → click **Save** → "Saved ✓" → navigate back to the concept and confirm the change shows. Then break it (delete the `type:` line) → Save is disabled and an error appears. (Do NOT run `next dev` from an automated subagent — it is long-running; the controller/human runs this.)

- [ ] **Step 6: Commit**

```bash
git add app/lib/actions.ts app/concept/[...path]/edit app/components/concept-detail.tsx app/concept/[...path]/page.tsx
git commit -m "feat(web): edit route, server actions, and Edit link"
```

---

### Task 8: Create new concept + docs

**Files:**
- Create: `app/concept/new/page.tsx`
- Modify: `app/components/nav.tsx` (a "new" link), `README.md` ("Editing" section)

**Interfaces:**
- Consumes: `ConceptEditor`, `validateAction`, `saveAction`.
- Produces: a `/concept/new` route that creates a new concept file via the same editor/actions (the path is part of the starter content's first line is NOT used; the user types the path).

- [ ] **Step 1: Create the new-concept route** (`app/concept/new/page.tsx`)

A minimal create flow: the editor saves to a path the user provides via the route query (`/concept/new?path=tables/foo.md`), defaulting to a placeholder. Starter content includes the required `type`.

```tsx
import { ConceptEditor } from '../../components/concept-editor';
import { validateAction, saveAction } from '../../lib/actions';

export const dynamic = 'force-dynamic';

const STARTER = `---\ntype: Note\ntitle: New concept\ntags: []\n---\n\n# New concept\n\nWrite knowledge here. Link others with [text](other.md).\n`;

export default async function NewConceptPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path = 'notes/new-concept.md' } = await searchParams;
  return (
    <main>
      <p className="okf-breadcrumb okf-home" style={{ maxWidth: 1060, padding: '22px 34px 0' }}>
        new concept → <code>{path}</code> (change the path in the URL: <code>?path=dir/name.md</code>)
      </p>
      <ConceptEditor path={path} initialContent={STARTER} onValidate={validateAction} onSave={saveAction} />
    </main>
  );
}
```

- [ ] **Step 2: Add a "new" link to the nav** (`app/components/nav.tsx`)

Add a link before the search form (keeps the existing brand + search):

```tsx
      <Link href="/concept/new" className="okf-nav__link">+ new</Link>
```

placed inside the `<nav>` between the brand `<Link>` and the search `<form>`. (Wrap the brand and this link in a `<div style={{display:'flex',alignItems:'center',gap:18}}>` so the search field stays right-aligned.)

- [ ] **Step 3: Update the nav test** (`app/components/nav.test.tsx`) to also assert the new link

```tsx
    expect(screen.getByRole('link', { name: /new/i }).getAttribute('href')).toBe('/concept/new');
```
(add inside the existing test, after the brand + searchbox assertions).

- [ ] **Step 4: Add an "Editing" section to `README.md`**

Insert after the "Run the web app" section:

```markdown
## Editing (M2a)

OKF Hub can edit concepts in the browser:

- Open a concept → **edit**, or **+ new** in the nav to create one.
- The editor validates live (the only required field is `type`) and shows a sanitized preview.
- **Save** writes the `.md` file in your bundle directory and re-indexes. **Commit with git** to persist:
  ```bash
  cd $OKF_BUNDLE_DIR && git add -A && git commit -m "edit via OKF Hub"
  ```

> Editing writes to your local bundle on disk. GitHub sign-in and automatic pull-request creation are a later milestone (M2b).
```

- [ ] **Step 5: Build + typecheck + tests**

Run: `npm run build`, `npm run typecheck`, `npm test`
Expected: build succeeds; typecheck clean; all tests pass (incl. the updated nav test).

- [ ] **Step 6: Commit**

```bash
git add app/concept/new app/components/nav.tsx app/components/nav.test.tsx README.md
git commit -m "feat(web): create new concepts; document editing"
```

---

## Self-Review

**Spec coverage** (against `2026-06-29-okf-hub-design.md`, the M2 edit flow + the recorded security note):
- §5 Edit flow — inline editor with live validation gated by `okf-core` rules (Tasks 4, 6, 7); save writes a concept (Tasks 3, 4, 7). **Scoped change vs the spec:** save writes the **local file** (user commits) instead of branch+commit+PR via GitHub — this is the user-chosen M2a; the GitHub OAuth + PR layer is deferred to a separate **M2b** plan. (documented)
- §9 Validation — reused verbatim (`validateConcept` + link integrity), surfaced live and as a save gate (errors block; warnings don't). ✓
- **Security note (the milestone's reason)** — `rehype-sanitize` on body rendering (Task 1) + HTML-escaped search snippets keeping `<mark>` (Task 2). ✓ This retires the trusted-bundle assumption that previously gated editing.
- §10 Error handling — path traversal rejected (Task 3); unknown concept → `notFound` on the edit route (Task 7); save refused on validation error (Task 4). ✓
- §8 Testing — node tests for bundle-io, edit-ops, resetService, snippet escaping, render sanitization; jsdom/RTL test for the editor (actions injected as mocks); build + manual smoke for the routes/actions. ✓
- Out of scope (deferred to M2b): GitHub OAuth, repo membership, branch/commit/PR via the GitHub API, multi-user. (documented)

**Placeholder scan:** No TBD/TODO; every code step has complete code; the one manual step (Task 7 Step 5) is an explicit human/controller smoke with concrete actions, not a code gap.

**Type consistency:** `ValidateFn`/`SaveFn` (Task 6) match `validateAction`/`saveAction` return shapes (Task 7) and the `validateContent`/`saveContent` returns (Task 4). `ValidationIssue` is the existing okf-core type throughout. `SNIPPET_OPEN`/`SNIPPET_CLOSE` exported from `queries.ts` (Task 2) and consumed by `escapeSnippet` in `data.ts`. `resolveBundlePath`/`readConceptSource`/`writeConceptSource` signatures (Task 3) match their uses in `edit-ops` (Task 4) and the edit route (Task 7). `resetService()` (Task 5) used by `saveAction` (Task 7).

---

## Execution Handoff

Implement with **superpowers:subagent-driven-development** (recommended) or **superpowers:executing-plans**. Order: sanitize render → escape snippets → bundle-io → edit-ops → resetService → editor component → wire route/actions/link → new-concept + docs. The data layer (Tasks 1–5) is rigorously TDD'd in node; the editor (Task 6) is TDD'd with injected mock actions; the route/action wiring (Tasks 7–8) is verified by `next build` + a manual smoke (the controller/human runs `npm run dev`, not an automated subagent).
