# In-App Usage Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The service guides users itself — every token-issuance moment gets a copy-paste "verify it now" block, bundle-path errors/hints teach the fix, the empty Work screen shows a runnable example, and a `/guide` page explains connect → record → query with the hub's real workspaces and host.

**Architecture:** A pure client-safe helper (`lib/agent-commands.ts`) is the single source of every user-visible command, built from the real origin (`window.location.origin` client-side, request headers server-side) — replacing the hardcoded `http://localhost:3000`. A shared `AgentSnippets` client component renders connect/test-write/test-read rows and is mounted at all three token moments. `/guide` is a server component rendering per-workspace cards with `<TOKEN>` placeholders (only hashes are stored).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript ESM, Vitest + jsdom. **No new dependencies. No backend logic changes** (the only non-UI edit is two error-message strings in `lib/bundle-source.ts`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-06-okf-hub-usage-guide-design.md`.
- **Branch:** `feat/usage-guide` (already created, stacked on `feat/m5-workspaces`). Commit trailer on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **English UI.** No new dependencies.
- **Command source of truth:** every command shown to a user comes from `buildAgentCommands` — never a hand-built string in a component. `app/lib/setup-actions.ts`'s `buildMcpCommand` stays untouched (its return keeps existing tests passing) but the UI stops rendering it.
- **`<TOKEN>` placeholder** is the literal string used when no token is available.
- **Hydration safety:** client components that need `window.location.origin` render their commands only after mount (`useEffect` → state), returning `null` before.
- **jsdom origin** in tests is `http://localhost:3000` (its default) — assertions may rely on it.
- **Test commands:** `npx vitest run <file>` (targeted), `npm test` (all), `npm run typecheck`, `npm run build`.

---

### Task 1: `lib/agent-commands.ts` — command builder

**Files:**
- Create: `lib/agent-commands.ts`
- Test: `lib/agent-commands.test.ts`

**Interfaces:**
- Produces:
  - `interface AgentCommands { mcpAdd: string; curlRecord: string; curlSearch: string }`
  - `buildAgentCommands(origin: string, slug: string | null, token?: string): AgentCommands` — `slug: null` targets the legacy default-workspace URLs (`/api/...`, server name `okf-hub`); `token` omitted → literal `<TOKEN>`.

- [ ] **Step 1: Write the failing test**

Create `lib/agent-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAgentCommands } from './agent-commands';

describe('buildAgentCommands', () => {
  it('builds workspace commands with origin, slug, and token', () => {
    const c = buildAgentCommands('https://hub.example.com', 'labs', 'SECRET42');
    expect(c.mcpAdd).toBe(
      'claude mcp add --transport http okf-labs https://hub.example.com/w/labs/api/mcp --header "Authorization: Bearer SECRET42"',
    );
    expect(c.curlRecord).toContain('https://hub.example.com/w/labs/api/v1/work');
    expect(c.curlRecord).toContain('Bearer SECRET42');
    expect(c.curlSearch).toBe("curl 'https://hub.example.com/w/labs/api/v1/search?q=hello'");
  });

  it('uses the <TOKEN> placeholder when no token is given', () => {
    const c = buildAgentCommands('http://localhost:3000', 'labs');
    expect(c.mcpAdd).toContain('Bearer <TOKEN>');
    expect(c.curlRecord).toContain('Bearer <TOKEN>');
  });

  it('slug null targets the legacy default-workspace URLs', () => {
    const c = buildAgentCommands('http://localhost:3000', null, 'T');
    expect(c.mcpAdd).toContain('okf-hub http://localhost:3000/api/mcp');
    expect(c.curlRecord).toContain('http://localhost:3000/api/v1/work');
    expect(c.curlSearch).toContain('http://localhost:3000/api/v1/search?q=hello');
  });

  it('commands are single-line (copy-paste safe)', () => {
    const c = buildAgentCommands('http://localhost:3000', 'x', 't');
    for (const cmd of [c.mcpAdd, c.curlRecord, c.curlSearch]) expect(cmd).not.toMatch(/\n/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/agent-commands.test.ts`
Expected: FAIL — cannot resolve `./agent-commands`.

- [ ] **Step 3: Write the implementation**

Create `lib/agent-commands.ts`:

```ts
export interface AgentCommands {
  mcpAdd: string;
  curlRecord: string;
  curlSearch: string;
}

const TOKEN_PLACEHOLDER = '<TOKEN>';

// The single source of every agent command shown in the UI. `slug: null`
// targets the legacy default-workspace URLs; omit `token` to embed <TOKEN>.
export function buildAgentCommands(origin: string, slug: string | null, token?: string): AgentCommands {
  const t = token ?? TOKEN_PLACEHOLDER;
  const base = slug ? `${origin}/w/${slug}` : origin;
  const name = slug ? `okf-${slug}` : 'okf-hub';
  return {
    mcpAdd: `claude mcp add --transport http ${name} ${base}/api/mcp --header "Authorization: Bearer ${t}"`,
    curlRecord: `curl -X POST ${base}/api/v1/work -H "Authorization: Bearer ${t}" -H 'content-type: application/json' -d '{"title":"hello","summary":"first record","actor":"me"}'`,
    curlSearch: `curl '${base}/api/v1/search?q=hello'`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/agent-commands.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add lib/agent-commands.ts lib/agent-commands.test.ts
git commit -m "feat(guide): agent-command builder — real origin, workspace or legacy URLs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `AgentSnippets` component

**Files:**
- Create: `app/components/agent-snippets.tsx`
- Test: `app/components/agent-snippets.test.tsx`
- Modify: `app/globals.css` (one small block)

**Interfaces:**
- Consumes: `buildAgentCommands` (Task 1); `CopyButton` from `app/components/copy-button` (existing).
- Produces: `AgentSnippets({ slug, token }: { slug: string; token: string })` — client component; renders after mount using `window.location.origin`.

- [ ] **Step 1: Write the failing test**

Create `app/components/agent-snippets.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AgentSnippets } from './agent-snippets';

afterEach(cleanup);

describe('AgentSnippets', () => {
  it('renders connect + write-test + read-test commands with the real origin, slug, and token', async () => {
    render(<AgentSnippets slug="labs" token="SECRET42" />);
    // jsdom origin is http://localhost:3000
    expect(await screen.findByText(/okf-labs http:\/\/localhost:3000\/w\/labs\/api\/mcp/)).toBeTruthy();
    expect(screen.getByText(/POST http:\/\/localhost:3000\/w\/labs\/api\/v1\/work/)).toBeTruthy();
    expect(screen.getByText(/search\?q=hello/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /copy/i }).length).toBe(3);
    expect(screen.getByText(/Expect HTTP 201/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/agent-snippets.test.tsx`
Expected: FAIL — cannot resolve `./agent-snippets`.

- [ ] **Step 3: Write the component**

Create `app/components/agent-snippets.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { buildAgentCommands } from '../../lib/agent-commands';
import { CopyButton } from './copy-button';

// "Verify it now" block shown wherever a token is issued. Builds commands from
// the real origin, so they are correct on any host — rendered after mount to
// avoid an SSR/hydration mismatch on window.location.
export function AgentSnippets({ slug, token }: { slug: string; token: string }) {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const cmd = buildAgentCommands(origin, slug, token);
  return (
    <div className="okf-snippets">
      <h3>1 · Connect an agent</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.mcpAdd}</code></pre><CopyButton text={cmd.mcpAdd} /></div>
      <p className="okf-setup__hint">Run where Claude Code is installed.</p>

      <h3>2 · Test a write</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.curlRecord}</code></pre><CopyButton text={cmd.curlRecord} /></div>
      <p className="okf-setup__hint">Expect HTTP 201 — then see it on the <a href="/work">Work timeline</a>.</p>

      <h3>3 · Test a read</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.curlSearch}</code></pre><CopyButton text={cmd.curlSearch} /></div>
      <p className="okf-setup__hint">Expect JSON with hits.</p>
    </div>
  );
}
```

- [ ] **Step 4: Append CSS to `app/globals.css`**

```css

/* --- Agent snippets (verify-it-now blocks) --- */
.okf-snippets { display: flex; flex-direction: column; gap: 6px; }
.okf-snippets h3 { margin: 10px 0 2px; font-size: 0.82rem; color: #2563eb; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/components/agent-snippets.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/agent-snippets.tsx app/components/agent-snippets.test.tsx app/globals.css
git commit -m "feat(guide): AgentSnippets verify-it-now block (connect + write/read tests)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Mount snippets at all three token moments

**Files:**
- Modify: `app/lib/setup-actions.ts` (completeSetup return gains `slug` — additive), `app/lib/setup-actions.test.ts` (one added assertion), `app/components/setup-wizard.tsx` (SetupDone), `app/components/setup-wizard.test.tsx` (mocks gain `slug`), `app/components/add-workspace.tsx` (success view), `app/components/rotate-token.tsx` (gains `slug` prop + snippets), `app/components/rotate-token.test.tsx`, `app/setup/page.tsx` (pass `slug` to RotateTokenPanel)

**Interfaces:**
- Consumes: `AgentSnippets` (Task 2).
- Produces: `completeSetup` success return becomes `{ ok: true; slug: string; token: string; mcpCommand: string }`; `RotateTokenPanel({ onRotate, slug }: { onRotate: () => Promise<RotateResult>; slug: string })`.

- [ ] **Step 1: Update the tests first**

In `app/lib/setup-actions.test.ts`, in the first completeSetup test after `if (!res.ok) return;` add:

```ts
    expect(res.slug).toBe('acme');
```

In `app/components/setup-wizard.test.tsx`:
- change the shared mock to include `slug`:

```ts
const okComplete = () => vi.fn(async () => ({ ok: true as const, slug: 'acme', token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));
```

- in the completion-screen describe, change the inline mock the same way:

```ts
    const onComplete = vi.fn(async () => ({ ok: true as const, slug: 'acme', token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));
```

- and at the end of the completion-screen test, replace the copy-buttons count line and add a snippet assertion:

```ts
    const copyButtons = await screen.findAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(4); // token + 3 snippet rows
    expect(screen.getByText(/okf-acme http:\/\/localhost:3000\/w\/acme\/api\/mcp/)).toBeTruthy();
```

In `app/components/rotate-token.test.tsx`, update the renders to pass `slug` and adjust the copy assertion (multiple copy buttons now):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { RotateTokenPanel } from './rotate-token';

afterEach(cleanup);

describe('RotateTokenPanel', () => {
  it('shows the new token once after rotating, with verify snippets', async () => {
    const onRotate = vi.fn(async () => ({ ok: true as const, token: 'NEWTOKEN999' }));
    render(<RotateTokenPanel onRotate={onRotate} slug="w1" />);
    fireEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    await waitFor(() => expect(onRotate).toHaveBeenCalled());
    expect(await screen.findByText('NEWTOKEN999')).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /copy/i }).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/\/w\/w1\/api\/mcp/)).toBeTruthy(); // verify snippets present
    expect(screen.getByText(/update your agent/i)).toBeTruthy();
  });

  it('shows the error when rotation is refused', async () => {
    const onRotate = vi.fn(async () => ({ ok: false as const, error: 'admin login required' }));
    render(<RotateTokenPanel onRotate={onRotate} slug="w1" />);
    fireEvent.click(screen.getByRole('button', { name: /rotate token/i }));
    expect(await screen.findByText(/admin login required/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/components/setup-wizard.test.tsx app/components/rotate-token.test.tsx app/lib/setup-actions.test.ts`
Expected: FAIL — `slug` missing from completeSetup return; RotateTokenPanel has no `slug` prop; no snippets rendered.

- [ ] **Step 3: Add `slug` to completeSetup's success return**

In `app/lib/setup-actions.ts`, change the signature and return of `completeSetup`:

```ts
export async function completeSetup(
  input: SetupInput,
): Promise<{ ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string }> {
```

and the final return:

```ts
  return { ok: true, slug, token, mcpCommand: buildMcpCommand(slug, token) };
```

- [ ] **Step 4: Use snippets in the wizard completion screen**

In `app/components/setup-wizard.tsx`:
- add the import: `import { AgentSnippets } from './agent-snippets';`
- change the `Result` type: `type Result = { ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string };`
- change the done state and setter: `const [done, setDone] = useState<{ slug: string; token: string } | null>(null);` and in `finish()`: `if (res.ok) setDone({ slug: res.slug, token: res.token });`
- change the done render: `if (done) return <SetupDone slug={done.slug} token={done.token} />;`
- replace `SetupDone` with:

```tsx
function SetupDone({ slug, token }: { slug: string; token: string }) {
  return (
    <section className="okf-setup okf-setup--done">
      <h1>Setup complete ✓</h1>
      <p className="okf-setup__help">
        This hub now serves your <b>knowledge bundle</b> — the folder of Markdown concepts you chose.
        The token and commands below connect your AI agents (Claude Code) to it, so they can
        <b> search the knowledge</b> here and <b>record the work they finish</b> back into it.
      </p>

      <h2>Your ingestion token</h2>
      <p className="okf-setup__hint">A bearer credential that lets an agent read and write this hub (via MCP + REST). Shown once and stored only as a hash — copy it now.</p>
      <div className="okf-setup__copyrow">
        <pre className="okf-setup__token"><code>{token}</code></pre>
        <CopyButton text={token} />
      </div>

      <h2>Try it now</h2>
      <AgentSnippets slug={slug} token={token} />

      <div className="okf-setup__note">
        <b>What this applies to:</b> this hub and the bundle you chose — <b>not your code repo</b>, and it does not scan or
        auto-document a codebase. Everything already in the bundle is searchable now; agents&rsquo; work records are added from here on.
      </div>

      <h2>What&rsquo;s next</h2>
      <p><a href="/">Browse the hub →</a> · <a href="/work">Work timeline →</a> · <a href="/guide">Read the guide →</a> · <a href="/setup">Manage settings →</a></p>
    </section>
  );
}
```

- [ ] **Step 5: Use snippets in the add-workspace success view**

In `app/components/add-workspace.tsx`: add `import { AgentSnippets } from './agent-snippets';` and replace the `if (done)` block's mcp section:

```tsx
  if (done) {
    return (
      <section className="okf-setup__row">
        <h2>Workspace &ldquo;{done.slug}&rdquo; created ✓</h2>
        <p className="okf-setup__warn">Copy this workspace&rsquo;s ingestion token now — it will not be shown again.</p>
        <div className="okf-setup__copyrow">
          <pre className="okf-setup__token"><code>{done.token}</code></pre>
          <CopyButton text={done.token} />
        </div>
        <h3>Try it now — this workspace only</h3>
        <AgentSnippets slug={done.slug} token={done.token} />
      </section>
    );
  }
```

- [ ] **Step 6: Give RotateTokenPanel a slug + snippets**

Replace `app/components/rotate-token.tsx` with:

```tsx
'use client';
import { useState } from 'react';
import { CopyButton } from './copy-button';
import { AgentSnippets } from './agent-snippets';

type RotateResult = { ok: boolean; token?: string; error?: string };

export function RotateTokenPanel({
  onRotate, slug,
}: { onRotate: () => Promise<RotateResult>; slug: string }) {
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      const res = await onRotate();
      if (res.ok && res.token) setToken(res.token);
      else setError(res.error ?? 'rotation failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rotation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="okf-setup__row">
      <p>Rotate the ingestion token (the old token stops working immediately).</p>
      {token && (
        <>
          <p className="okf-setup__warn">Copy the new token now — it will not be shown again.</p>
          <div className="okf-setup__copyrow">
            <pre className="okf-setup__token"><code>{token}</code></pre>
            <CopyButton text={token} />
          </div>
          <p className="okf-setup__hint">Update your agent: re-run the connect command below with the new token.</p>
          <AgentSnippets slug={slug} token={token} />
        </>
      )}
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="button" onClick={rotate} disabled={busy}>{busy ? 'Rotating…' : 'Rotate token'}</button>
    </div>
  );
}
```

In `app/setup/page.tsx`, pass the slug:

```tsx
          <RotateTokenPanel onRotate={rotateToken.bind(null, ws.slug)} slug={ws.slug} />
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run app/components/setup-wizard.test.tsx app/components/rotate-token.test.tsx app/components/add-workspace.test.tsx app/lib/setup-actions.test.ts && npm run typecheck`
Expected: all PASS (the add-workspace test's `/w/labs/api/mcp` assertion now matches the snippet's mcpAdd command); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add app/lib/setup-actions.ts app/lib/setup-actions.test.ts app/components/setup-wizard.tsx app/components/setup-wizard.test.tsx app/components/add-workspace.tsx app/components/rotate-token.tsx app/components/rotate-token.test.tsx app/setup/page.tsx
git commit -m "feat(guide): verify-it-now snippets at wizard, add-workspace, and rotate moments

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Bundle-path errors and hints that teach

**Files:**
- Modify: `lib/bundle-source.ts` (two error strings), `lib/bundle-source.test.ts` (assert guidance), `app/components/setup-wizard.tsx` (step-2 local hint), `app/components/add-workspace.tsx` (local hint added), `app/setup/page.tsx` (change-bundle hint)

**Interfaces:** none new.

- [ ] **Step 1: Extend the failing test**

In `lib/bundle-source.test.ts`, inside `describe('validateLocalPath', ...)` append:

```ts
  it('error messages teach the fix', () => {
    const missing = validateLocalPath('/no/such/path');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('~ is not expanded');
    const d = mkdtempSync(join(tmpdir(), 'okf-lp3-'));
    const empty = validateLocalPath(d);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('top level');
    rmSync(d, { recursive: true, force: true });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bundle-source.test.ts`
Expected: FAIL — messages lack the guidance.

- [ ] **Step 3: Update the two error strings**

In `lib/bundle-source.ts`, in `validateLocalPath`:

```ts
    return { ok: false, error: `path does not exist: ${path} — use an absolute path on the server (~ is not expanded)` };
```

and:

```ts
  if (!hasMd) return { ok: false, error: 'directory contains no .md files — add at least one .md at the top level' };
```

- [ ] **Step 4: Upgrade the three hints**

In `app/components/setup-wizard.tsx` (step 2, local option) replace the hint line with:

```tsx
                <p className="okf-setup__hint">Absolute path on the server — ~ is not expanded. Needs at least one .md file at its top level. e.g. /srv/okf-bundle.</p>
```

In `app/components/add-workspace.tsx`, after the local-path input add the same hint:

```tsx
        {bundleSource === 'local' && (
          <>
            <input aria-label="new local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
            <p className="okf-setup__hint">Absolute path on the server — ~ is not expanded. Needs at least one .md file at its top level. e.g. /srv/okf-bundle.</p>
          </>
        )}
```

In `app/setup/page.tsx`, replace the change-bundle hint line with:

```tsx
            <p className="okf-setup__hint">example = built-in sample data · local = absolute folder path on this server (no ~; needs a top-level .md) · git = clone a public https:// repo.</p>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/bundle-source.test.ts && npm test && npm run typecheck`
Expected: bundle-source PASS (9 cases); full suite green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add lib/bundle-source.ts lib/bundle-source.test.ts app/components/setup-wizard.tsx app/components/add-workspace.tsx app/setup/page.tsx
git commit -m "feat(guide): bundle-path errors and hints teach the fix (absolute path, no ~, .md)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Work empty state shows a runnable example

**Files:**
- Create: `app/components/work-empty-hint.tsx`
- Modify: `app/components/work-timeline.tsx` (empty branch), `app/components/work-timeline.test.tsx` (empty-state test)

**Interfaces:**
- Consumes: `buildAgentCommands` (Task 1), `CopyButton` (existing).
- Produces: `WorkEmptyHint()` — client component, no props (legacy/default-workspace command).

- [ ] **Step 1: Update the failing test**

In `app/components/work-timeline.test.tsx`, replace the empty-state test:

```tsx
  it('shows an empty state with a runnable example and a guide link', async () => {
    render(<WorkTimeline view={{ filter: {}, total: 0, groups: [] }} />);
    expect(screen.getByText(/No work records yet/i)).toBeTruthy();
    expect(await screen.findByText(/curl -X POST http:\/\/localhost:3000\/api\/v1\/work/)).toBeTruthy(); // jsdom origin
    expect(screen.getByRole('link', { name: /read the guide/i }).getAttribute('href')).toBe('/guide');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/work-timeline.test.tsx`
Expected: FAIL — no curl example / guide link.

- [ ] **Step 3: Create `app/components/work-empty-hint.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { buildAgentCommands } from '../../lib/agent-commands';
import { CopyButton } from './copy-button';

// Runnable example for the empty Work timeline. Targets the legacy
// (default-workspace) URL, which is what this page serves.
export function WorkEmptyHint() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const { curlRecord } = buildAgentCommands(origin, null);
  return (
    <div className="okf-setup__copyrow">
      <pre><code>{curlRecord}</code></pre>
      <CopyButton text={curlRecord} />
    </div>
  );
}
```

- [ ] **Step 4: Use it in the empty branch of `app/components/work-timeline.tsx`**

Add the import `import { WorkEmptyHint } from './work-empty-hint';` and replace the empty-state `<p>` with:

```tsx
        <div className="okf-work-empty">
          <p>
            No work records yet. Agents record work via the MCP tool <code>okf_record_work</code>{' '}
            or <code>POST /api/v1/work</code> — try it now (replace <code>&lt;TOKEN&gt;</code> with your ingestion token):
          </p>
          <WorkEmptyHint />
          <p><a href="/guide">Read the guide →</a></p>
        </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/components/work-timeline.test.tsx && npm run typecheck`
Expected: PASS (3 cases); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/work-empty-hint.tsx app/components/work-timeline.tsx app/components/work-timeline.test.tsx
git commit -m "feat(guide): empty Work timeline shows a runnable record example + guide link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `/guide` page + nav link

**Files:**
- Create: `app/guide/page.tsx`
- Modify: `app/components/nav.tsx` (Guide link), `app/components/nav.test.tsx` (one test), `app/globals.css` (guide styles)

**Interfaces:**
- Consumes: `buildAgentCommands` (Task 1), `CopyButton` (existing), `readConfig`/`setupState` (existing), `headers` from `next/headers`, `redirect` from `next/navigation`.

- [ ] **Step 1: Update the failing nav test**

Append inside the `describe('Nav', ...)` block of `app/components/nav.test.tsx`:

```ts
  it('links to the guide', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /^Guide$/ }).getAttribute('href')).toBe('/guide');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/nav.test.tsx`
Expected: FAIL — no Guide link.

- [ ] **Step 3: Add the nav link**

In `app/components/nav.tsx`, after the Work link:

```tsx
        <Link href="/work" className="okf-nav__link">Work</Link>
        <Link href="/guide" className="okf-nav__link">Guide</Link>
        <Link href="/setup" className="okf-nav__link">Settings</Link>
```

- [ ] **Step 4: Create `app/guide/page.tsx`**

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readConfig, setupState } from '../../lib/config';
import { buildAgentCommands } from '../../lib/agent-commands';
import { CopyButton } from '../components/copy-button';

export const dynamic = 'force-dynamic';

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0]!.trim();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

function CommandRow({ label, cmd, note }: { label: string; cmd: string; note?: string }) {
  return (
    <>
      <p className="okf-setup__hint"><b>{label}</b>{note ? ` — ${note}` : ''}</p>
      <div className="okf-setup__copyrow">
        <pre><code>{cmd}</code></pre>
        <CopyButton text={cmd} />
      </div>
    </>
  );
}

export default async function GuidePage() {
  if (setupState() === 'first-run') redirect('/setup');
  const origin = await requestOrigin();
  const cfg = readConfig();
  const workspaces = cfg?.workspaces ?? [];
  const defaultSlug = cfg?.defaultWorkspace ?? null;
  const legacy = buildAgentCommands(origin, null);

  return (
    <main className="okf-setup okf-screen okf-guide">
      <h1>Guide</h1>
      <p className="okf-setup__lede">How to connect agents to this hub, record work, and query the knowledge.</p>

      <section className="okf-setup__ws">
        <h2>How this hub works</h2>
        <p className="okf-setup__hint">
          A <b>bundle</b> (a folder of Markdown concepts) is served as browsable, searchable knowledge.
          <b> Agents</b> connect over MCP or REST with a workspace&rsquo;s <b>ingestion token</b>: they search and read
          the knowledge, and <b>record completed work</b> back in as WorkRecords (see the <a href="/work">Work timeline</a>).
          Each workspace has its own bundle, index, token, and URLs.
        </p>
      </section>

      {workspaces.length === 0 ? (
        <section className="okf-setup__ws">
          <h2>This hub {cfg ? 'workspace' : '(configured via environment)'}</h2>
          <p className="okf-setup__hint">Replace <code>&lt;TOKEN&gt;</code> with your ingestion token{cfg ? '' : ' (the OKF_INGEST_TOKEN env value)'}.</p>
          <CommandRow label="Connect an agent" cmd={legacy.mcpAdd} note="run where Claude Code is installed" />
          <CommandRow label="Record work" cmd={legacy.curlRecord} note="expect HTTP 201" />
          <CommandRow label="Search" cmd={legacy.curlSearch} note="expect JSON with hits" />
        </section>
      ) : (
        workspaces.map((ws) => {
          const cmd = buildAgentCommands(origin, ws.slug);
          return (
            <section key={ws.slug} className="okf-setup__ws">
              <h2>{ws.name} {defaultSlug === ws.slug && <span className="okf-setup__badge">default</span>}</h2>
              <p className="okf-setup__hint">
                /w/{ws.slug} · API base: <code>{origin}/w/{ws.slug}/api/v1</code> · MCP: <code>{origin}/w/{ws.slug}/api/mcp</code>
                {defaultSlug === ws.slug && <> · also served at the legacy <code>{origin}/api/…</code> URLs</>}
              </p>
              <p className="okf-setup__hint">
                Replace <code>&lt;TOKEN&gt;</code> with this workspace&rsquo;s ingestion token — it was shown once when the
                workspace was created (or last rotated). Lost it? <a href="/setup">Rotate it in Settings</a>.
              </p>
              <CommandRow label="Connect an agent" cmd={cmd.mcpAdd} note="run where Claude Code is installed" />
              <CommandRow label="Record work" cmd={cmd.curlRecord} note="expect HTTP 201" />
              <CommandRow label="Search" cmd={cmd.curlSearch} note="expect JSON with hits" />
            </section>
          );
        })
      )}

      <section className="okf-setup__ws">
        <h2>Manage workspaces</h2>
        <p className="okf-setup__hint">
          In <a href="/setup">Settings</a> (admin): add a workspace (its token and connect command are shown once) ·
          rotate a token (the old one stops working immediately) · change a bundle · set the default workspace
          (which the legacy <code>/api/…</code> URLs and the home page serve).
        </p>
      </section>

      <section className="okf-setup__ws">
        <h2>Troubleshooting</h2>
        <table className="okf-guide__table">
          <tbody>
            <tr><td><code>401</code></td><td>Wrong token, or a token from a different workspace — tokens are workspace-scoped.</td></tr>
            <tr><td><code>503</code></td><td>Ingestion not configured — finish <a href="/setup">setup</a> or set <code>OKF_INGEST_TOKEN</code>.</td></tr>
            <tr><td><code>404 unknown workspace</code></td><td>The <code>/w/&lt;slug&gt;</code> in the URL doesn&rsquo;t exist — check Settings for the exact slug.</td></tr>
            <tr><td>path does not exist</td><td>Bundle paths must be absolute on the server; <code>~</code> is not expanded; the folder needs at least one top-level <code>.md</code>.</td></tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Append guide styles to `app/globals.css`**

```css

/* --- Guide page --- */
.okf-guide { max-width: 720px; }
.okf-guide__table { border-collapse: collapse; font-size: 0.85rem; }
.okf-guide__table td { border-top: 1px dashed #d7deea; padding: 8px 12px 8px 0; vertical-align: top; }
.okf-guide__table td:first-child { white-space: nowrap; color: #b42318; }
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run app/components/nav.test.tsx && npm test && npm run typecheck && npm run build`
Expected: nav 4 cases PASS; full suite green; build compiles `/guide`.

- [ ] **Step 7: Commit**

```bash
git add app/guide/page.tsx app/components/nav.tsx app/components/nav.test.tsx app/globals.css
git commit -m "feat(guide): /guide page — per-workspace connect cards, recipes, troubleshooting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Final verification + runtime check (controller)

- [ ] **Step 1: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: full suite green (existing + agent-commands/agent-snippets/updated component cases); `/guide` compiles.

- [ ] **Step 2: Runtime check (controller — browser or curl)**

```bash
rm -rf /tmp/okf-guide-try && OKF_CONFIG_DIR=/tmp/okf-guide-try PORT=3000 npm start
```
1. Wizard completion shows "Try it now" with 3 commands using the real origin (not hardcoded) + Copy buttons.
2. `/guide` renders one card per workspace with correct slugs/URLs; troubleshooting table present; nav has Guide.
3. Empty `/work` (fresh workspace with no records — the example bundle has none until you post) shows the curl example + guide link.
4. Rotate a token in Settings → new token + "update your agent" + snippets.
5. Bad local path in add-workspace → error text includes "~ is not expanded".
Stop the server; `git status` clean (remove `bundles/example/work/` if any test records were posted).

- [ ] **Step 3: Then use superpowers:finishing-a-development-branch**

---

## Final Verification (before finishing the branch)

- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build` — all routes compile including `/guide`.
- [ ] Task 7 runtime check passed; working tree clean.
