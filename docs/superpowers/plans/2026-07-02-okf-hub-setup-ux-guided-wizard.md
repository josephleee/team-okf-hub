# Guided Setup UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/setup` into a guided 3-step wizard that explains, per step, what/why/how to configure — plus a clearer completion screen, an inline-error admin login, and friendlier settings copy.

**Architecture:** Frontend-only UX overhaul. The `SetupWizard` client component becomes a 3-step stepper (progress header, per-step What/Why/How, Next disabled until the step is valid). The completion screen is restructured into token / MCP / what's-next sections with Copy buttons. The admin login form becomes a client component (`AdminLogin`) with an inline wrong-password error and `router.refresh()` on success. Settings copy is expanded. **No server action changes**: `completeSetup`, `adminLogin`, `rotateToken`, etc., and the `SetupInput` contract are untouched.

**Tech Stack:** Next.js 15 (App Router, client components), React 19 (`useState`, `useRouter().refresh()`), TypeScript ESM, Vitest + jsdom + @testing-library/react. No new runtime dependencies.

## Global Constraints

- **Backend frozen:** do NOT edit `app/lib/setup-actions.ts`, `app/lib/admin-session.ts`, or anything under `lib/`. Reuse the existing `SetupInput` type and server actions exactly.
- **UI language:** English.
- **No new dependencies.** Pure React state + CSS in `app/globals.css`.
- **Validation gating:** Next is disabled until the current step is valid. Bundle rules — example: always valid; local: `localPath.trim()` non-empty; git: `gitUrl.trim()` matches `^https:\/\/`. Admin password: `length >= 8`.
- **Passing a server action to a client component as a prop is the intended pattern** (mirrors the existing `onComplete={completeSetup}`).
- **CSS:** extend existing `.okf-setup*` rules; use literal color fallbacks (`#2563eb`, `#eef2fb`, `#d7deea`, `#5b6b82`, `#0f2747`, `#0f7b46`) — do not assume CSS custom properties beyond those already used.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/m4a-web-setup` (PR #1, unmerged).
- **Test commands:** `npx vitest run <file>` (targeted), `npm test` (all), `npm run typecheck`, `npm run build`.

---

### Task 1: `AdminLogin` client component + wire into the setup page

**Files:**
- Create: `app/components/admin-login.tsx`
- Test: `app/components/admin-login.test.tsx`
- Modify: `app/setup/page.tsx` (replace the inline login `<form>` with `<AdminLogin onLogin={adminLogin} />`)

**Interfaces:**
- Consumes: `adminLogin(password: string): Promise<{ ok: boolean; error?: string }>` (existing server action); `useRouter` from `next/navigation`.
- Produces: `AdminLogin({ onLogin }: { onLogin: (password: string) => Promise<{ ok: boolean; error?: string }> })`.

- [ ] **Step 1: Write the failing test**

Create `app/components/admin-login.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AdminLogin } from './admin-login';

afterEach(() => { cleanup(); refresh.mockClear(); });

describe('AdminLogin', () => {
  it('shows an inline error on wrong password and does not refresh', async () => {
    const onLogin = vi.fn(async () => ({ ok: false, error: 'wrong password' }));
    render(<AdminLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/wrong password/i)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes the route on a correct password', async () => {
    const onLogin = vi.fn(async () => ({ ok: true as const }));
    render(<AdminLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'correct-pw' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/admin-login.test.tsx`
Expected: FAIL — cannot resolve `./admin-login`.

- [ ] **Step 3: Write the component**

Create `app/components/admin-login.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginResult = { ok: boolean; error?: string };

export function AdminLogin({ onLogin }: { onLogin: (password: string) => Promise<LoginResult> }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onLogin(password);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'login failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="okf-setup" onSubmit={submit}>
      <h1>Admin login</h1>
      <p className="okf-setup__lede">This hub is already configured. Enter the admin password to change settings.</p>
      <label>Password
        <input type="password" aria-label="admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/components/admin-login.test.tsx`
Expected: PASS (2 cases).

- [ ] **Step 5: Wire it into the setup page**

In `app/setup/page.tsx`, add the import after the existing component imports:

```tsx
import { AdminLogin } from '../components/admin-login';
```

Replace the not-admin branch's inline form:

```tsx
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
```

with:

```tsx
  if (!admin) {
    return (
      <main className="okf-setup okf-screen">
        <AdminLogin onLogin={adminLogin} />
      </main>
    );
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/components/admin-login.tsx app/components/admin-login.test.tsx app/setup/page.tsx
git commit -m "feat(setup): admin login as client component with inline error + refresh

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `SetupWizard` → guided 3-step stepper (+ wizard CSS)

**Files:**
- Modify: `app/components/setup-wizard.tsx` (rewrite the form into a stepper; keep the existing done-screen markup inline for now — Task 3 restructures it)
- Modify: `app/components/setup-wizard.test.tsx` (rewrite for the stepper)
- Modify: `app/globals.css` (append the guided-setup CSS block used by Tasks 2 and 3)

**Interfaces:**
- Consumes: `SetupInput` type from `../lib/setup-actions`; the `onComplete` prop (unchanged signature).
- Produces: `SetupWizard({ onComplete })` unchanged prop contract; internal step state.

- [ ] **Step 1: Write the failing test**

Replace `app/components/setup-wizard.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SetupWizard } from './setup-wizard';

afterEach(cleanup);

const okComplete = () => vi.fn(async () => ({ ok: true as const, token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));

describe('SetupWizard stepper', () => {
  it('gates Next on step 1 until a workspace name is entered', () => {
    render(<SetupWizard onComplete={okComplete()} />);
    const next = screen.getByRole('button', { name: /next/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it('walks all 3 steps and submits the correct SetupInput (example bundle)', async () => {
    const onComplete = okComplete();
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → step 2 (bundle)
    fireEvent.click(screen.getByRole('button', { name: /next/i }));            // → step 3 (password)
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: 'Acme', bundleSource: 'example', adminPassword: 'longenough' }),
    ));
    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy(); // interim done screen still shows the token
  });

  it('requires a git url before leaving the bundle step', () => {
    render(<SetupWizard onComplete={okComplete()} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i })); // → step 2
    fireEvent.click(screen.getByLabelText(/clone a public git url/i));
    const next = screen.getByRole('button', { name: /next/i });
    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/git url/i), { target: { value: 'https://github.com/org/b.git' } });
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the server error on the finish step', async () => {
    const onComplete = vi.fn(async () => ({ ok: false as const, error: 'directory contains no .md files' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));
    expect(await screen.findByText(/no \.md files/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/setup-wizard.test.tsx`
Expected: FAIL — there is no "Next" button yet (single-page form).

- [ ] **Step 3: Rewrite the component as a stepper**

Replace `app/components/setup-wizard.tsx` with:

```tsx
'use client';
import { useState } from 'react';
import type { SetupInput } from '../lib/setup-actions';

type Result = { ok: true; token: string; mcpCommand: string } | { ok: false; error: string };
type BundleSource = 'example' | 'local' | 'git';

const STEP_TITLES = ['Name this workspace', 'Choose a knowledge bundle', 'Set an admin password'];

export function SetupWizard({ onComplete }: { onComplete: (input: SetupInput) => Promise<Result> }) {
  const [step, setStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState('');
  const [bundleSource, setBundleSource] = useState<BundleSource>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; mcpCommand: string } | null>(null);

  function stepValid(): boolean {
    if (step === 0) return workspaceName.trim().length > 0;
    if (step === 1) {
      if (bundleSource === 'local') return localPath.trim().length > 0;
      if (bundleSource === 'git') return /^https:\/\//.test(gitUrl.trim());
      return true;
    }
    return adminPassword.length >= 8;
  }

  async function finish() {
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
    <section className="okf-setup">
      <div className="okf-setup__steps" aria-label={`Step ${step + 1} of 3`}>
        {STEP_TITLES.map((t, i) => (
          <span key={t} className={`okf-setup__dot${i === step ? ' is-current' : i < step ? ' is-done' : ''}`} />
        ))}
        <span className="okf-setup__steplabel">Step {step + 1} of 3 · {STEP_TITLES[step]}</span>
      </div>

      {step === 0 && (
        <>
          <h1>Welcome to OKF Hub</h1>
          <p className="okf-setup__lede">Three quick steps — nothing is saved until you finish.</p>
          <div className="okf-setup__help">
            <p><b>What</b> — a label for this hub.</p>
            <p><b>Why</b> — it appears in the header and settings so your team recognizes this instance.</p>
            <p><b>How</b> — type a short name.</p>
          </div>
          <label>Workspace name
            <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Data" />
          </label>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Choose a knowledge bundle</h1>
          <div className="okf-setup__help">
            <p><b>What</b> — the folder of Markdown concepts this hub serves.</p>
            <p><b>Why</b> — everything browsable and searchable comes from here.</p>
            <p><b>How</b> — pick a source below.</p>
          </div>
          <fieldset className="okf-setup__bundle">
            <legend>Bundle source</legend>
            <label><input type="radio" name="src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
            <p className="okf-setup__hint">Not sure yet? Start with sample data — you can change this in Settings later.</p>
            <label><input type="radio" name="src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
            {bundleSource === 'local' && (
              <>
                <input aria-label="local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
                <p className="okf-setup__hint">A folder already on this server. Must contain at least one .md file.</p>
              </>
            )}
            <label><input type="radio" name="src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
            {bundleSource === 'git' && (
              <>
                <input aria-label="git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
                <p className="okf-setup__hint">Public https:// URL only. We clone it once; private/loopback hosts are rejected.</p>
              </>
            )}
          </fieldset>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Set an admin password</h1>
          <div className="okf-setup__help">
            <p><b>What</b> — the admin credential for this hub.</p>
            <p><b>Why</b> — changing settings later (rename, rotate the token, switch bundle) requires it, so a visitor can't reconfigure your hub.</p>
            <p><b>How</b> — at least 8 characters.</p>
          </div>
          <label>Admin password
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="at least 8 characters" />
          </label>
          {adminPassword.length > 0 && adminPassword.length < 8 && (
            <p className="okf-setup__hint">{8 - adminPassword.length} more character(s) needed.</p>
          )}
          <div className="okf-setup__summary">
            You&rsquo;re about to create — Workspace: <b>{workspaceName || '—'}</b> · Bundle: <b>{bundleSource}</b>
          </div>
        </>
      )}

      {error && <p className="okf-setup__error" role="alert">{error}</p>}

      <div className="okf-setup__nav">
        {step > 0 && (
          <button type="button" className="okf-setup__back" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}>← Back</button>
        )}
        {step < 2 && (
          <button type="button" onClick={() => setStep(step + 1)} disabled={!stepValid()}>Next →</button>
        )}
        {step === 2 && (
          <button type="button" onClick={finish} disabled={!stepValid() || busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Append the guided-setup CSS**

Append to `app/globals.css`:

```css

/* --- Guided setup wizard --- */
.okf-setup__steps { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.okf-setup__dot { width: 10px; height: 10px; border-radius: 50%; background: #d7deea; }
.okf-setup__dot.is-current { background: #2563eb; }
.okf-setup__dot.is-done { background: #0f7b46; }
.okf-setup__steplabel { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #5b6b82; margin-left: 6px; }
.okf-setup__help { background: #eef2fb; border-radius: 10px; padding: 10px 14px; font-size: 0.86rem; color: #0f2747; }
.okf-setup__help p { margin: 3px 0; }
.okf-setup__help b { color: #2563eb; }
.okf-setup__hint { font-size: 0.8rem; color: #5b6b82; margin: 2px 0 6px; }
.okf-setup__nav { display: flex; gap: 10px; margin-top: 6px; }
.okf-setup__nav .okf-setup__back { background: transparent; color: #2563eb; border: 1px solid #d7deea; }
.okf-setup__summary { border: 1px dashed #d7deea; border-radius: 8px; padding: 10px 12px; font-size: 0.86rem; color: #5b6b82; }
.okf-setup__copyrow { display: flex; align-items: flex-start; gap: 8px; }
.okf-setup__copyrow pre { flex: 1; margin: 0; }
.okf-setup__copy { align-self: flex-start; padding: 6px 12px; font-size: 0.8rem; }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run app/components/setup-wizard.test.tsx && npm run typecheck`
Expected: 4 stepper tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/components/setup-wizard.tsx app/components/setup-wizard.test.tsx app/globals.css
git commit -m "feat(setup): guided 3-step wizard with per-step what/why/how + validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Restructure the completion screen (token / MCP / what's-next + Copy)

**Files:**
- Modify: `app/components/setup-wizard.tsx` (replace the inline `done` markup with a `SetupDone` sub-component + a `CopyButton`)
- Modify: `app/components/setup-wizard.test.tsx` (append completion-screen assertions)

**Interfaces:**
- Consumes: nothing new.
- Produces: internal `SetupDone` / `CopyButton` (module-private; not exported).

- [ ] **Step 1: Append the failing test**

Append inside `app/components/setup-wizard.test.tsx` (new `describe` at the end of the file):

```tsx
describe('SetupWizard completion screen', () => {
  it('shows token + mcp with Copy buttons and a copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onComplete = vi.fn(async () => ({ ok: true as const, token: 'TESTTOKEN123', mcpCommand: 'claude mcp add ... Bearer TESTTOKEN123' }));
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.change(screen.getByLabelText(/admin password/i), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByText('TESTTOKEN123')).toBeTruthy();
    const copyButtons = await screen.findAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2); // token + mcp command
    fireEvent.click(copyButtons[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('TESTTOKEN123'));
    expect(await screen.findByText(/copied/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /manage settings/i }).getAttribute('href')).toBe('/setup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/setup-wizard.test.tsx`
Expected: FAIL — the current done screen has no Copy buttons / "Manage settings" link.

- [ ] **Step 3: Add `CopyButton` + `SetupDone` and use them**

In `app/components/setup-wizard.tsx`, add these two module-private components at the bottom of the file (after the `SetupWizard` export):

```tsx
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button type="button" className="okf-setup__copy" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
  );
}

function SetupDone({ token, mcpCommand }: { token: string; mcpCommand: string }) {
  return (
    <section className="okf-setup okf-setup--done">
      <h1>Setup complete ✓</h1>

      <h2>Your ingestion token</h2>
      <p className="okf-setup__help">A bearer credential agents use to read and write this hub via MCP + REST. It is shown once and stored only as a hash — copy it now.</p>
      <div className="okf-setup__copyrow">
        <pre className="okf-setup__token"><code>{token}</code></pre>
        <CopyButton text={token} />
      </div>

      <h2>Connect an agent</h2>
      <div className="okf-setup__copyrow">
        <pre><code>{mcpCommand}</code></pre>
        <CopyButton text={mcpCommand} />
      </div>
      <p className="okf-setup__hint">Run this where Claude Code is installed.</p>

      <h2>What&rsquo;s next</h2>
      <p><a href="/">Browse the hub →</a> · <a href="/work">Work timeline →</a> · <a href="/setup">Manage settings →</a></p>
    </section>
  );
}
```

Then replace the inline `if (done) { return ( ... ); }` block in `SetupWizard` with:

```tsx
  if (done) return <SetupDone token={done.token} mcpCommand={done.mcpCommand} />;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/components/setup-wizard.test.tsx`
Expected: PASS (all stepper + completion cases).

- [ ] **Step 5: Commit**

```bash
git add app/components/setup-wizard.tsx app/components/setup-wizard.test.tsx
git commit -m "feat(setup): clearer completion screen (token/MCP/next) with copy buttons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Friendlier settings-view copy

**Files:**
- Modify: `app/setup/page.tsx` (the file-configured + admin branch: add intro + per-control hints)

**Interfaces:**
- Consumes: nothing new (static copy).

- [ ] **Step 1: Add the copy**

In `app/setup/page.tsx`, in the final `return` (the admin settings view), make these additions.

After the `<h1>Settings — {cfg?.workspaceName}</h1>` line, add:

```tsx
      <p className="okf-setup__lede">Signed in as admin. Changes take effect immediately.</p>
```

In the rename form, after the `<label>Workspace name …</label>` line, add:

```tsx
        <p className="okf-setup__hint">Shown in the header and here.</p>
```

In the change-bundle form, immediately after its opening `<form …>` tag, add:

```tsx
        <p className="okf-setup__hint">example = built-in sample data · local = a folder on this server (needs a .md file) · git = clone a public https:// repo.</p>
```

(Leave the `RotateTokenPanel`, the rotate warning, and all server actions unchanged.)

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean; `/setup` compiles.

- [ ] **Step 3: Commit**

```bash
git add app/setup/page.tsx
git commit -m "feat(setup): explain each settings control (intro + per-field hints)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification (before finishing)

- [ ] `npm test` — full suite green (existing + updated setup-wizard, new admin-login).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build` — all routes compile (including `/setup`).
- [ ] **Runtime smoke (clean state, no env vars):** `rm -rf /tmp/okf-ux-smoke && OKF_CONFIG_DIR=/tmp/okf-ux-smoke PORT=3000 npm start`, then in the browser: walk the 3 wizard steps (Next disabled until each is valid), finish, confirm the completion screen shows the token with a working Copy button and the `claude mcp add …` command; grab the token and confirm it drives `POST /api/v1/work` → 201 and `POST /api/mcp` tools/list → 5 tools; reload `/setup` → admin login; enter a wrong password (inline error, no navigation) then the correct one (settings view appears **without a manual reload**); confirm the settings copy/hints render. Stop the server; confirm `git status` clean (no `bundles/example/work/` pollution — do not POST work against the tracked example bundle; point `OKF_CONFIG_DIR` at /tmp and avoid ingesting, or accept and delete any generated `bundles/example/work/`).
- [ ] Then use superpowers:finishing-a-development-branch.
