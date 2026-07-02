# Guided Setup UX — Design (M4a follow-up)

**Goal:** Make the `/setup` experience self-explanatory. Today it is a bare single-page
form with no guidance; a first-time operator cannot tell *what* a "bundle" is, *why* an
admin password matters, or *what* the ingestion token is for. This redesign turns first-run
setup into a **guided 3-step wizard** that explains, per step, **what** you are setting,
**why** it matters, and **how** to fill it — and gives the completion screen, admin login,
and settings view the same clarity.

**Non-goal / constraint:** the **backend does not change**. All server actions in
`app/lib/setup-actions.ts` and the `SetupInput` contract stay exactly as-is. This is a
frontend UX overhaul plus converting the admin-login form to a client component. No new
runtime dependencies (pure React state + `app/globals.css`).

## Global decisions (locked)

- **Structure:** multi-step stepper, **3 input steps** (no separate intro step — the intro
  copy folds into Step 1). Progress header shows `Step N of 3 · <title>` with dots.
- **Language:** English UI (consistent with the rest of the app; public OSS audience).
- **Scope:** first-run wizard + completion screen + admin login + settings view + inline
  validation/error messages.
- **Navigation:** Back/Next; **Next is disabled until the current step is valid**; Step 3's
  primary button is "Finish setup".
- **Admin login:** converted to a client component with **inline error on wrong password**
  and, on success, `router.refresh()` so the settings view appears immediately (fixes the
  prior "log in, then reload" wrinkle without touching `adminLogin`).
- **No new deps.** `SetupInput` contract unchanged → server-action tests unchanged.

---

## Component 1 — `SetupWizard` (first-run, 3-step stepper)

**File:** `app/components/setup-wizard.tsx` (refactor; keep the `onComplete: (input: SetupInput) => Promise<Result>` prop and the `Result` type).

**Local state:** `step` (0–2), the existing field state (`workspaceName`, `bundleSource`,
`localPath`, `gitUrl`, `adminPassword`), `busy`, `error`, `done`.

**Progress header (presentational):** `● ● ○  Step 2 of 3 · Choose a knowledge bundle`.
Dots reflect completed/current/upcoming. Not clickable (linear); Back moves to the previous step.

**Per-step content** — each step renders a short **What / Why / How** block above its input:

- **Step 1 · Name this workspace**
  - *What:* a label for this hub. *Why:* it appears in the header and settings so your team
    recognizes the instance. *How:* type a short name (e.g. "Acme Data").
  - Top-of-wizard lede (Step 1 only): "Welcome to OKF Hub. Three quick steps — nothing is
    saved until you finish."
  - **Valid when:** `workspaceName.trim()` is non-empty.
- **Step 2 · Choose a knowledge bundle**
  - *What:* the folder of Markdown concepts this hub serves. *Why:* everything
    browsable/searchable comes from here. *How:* pick one source; a hint appears per choice:
    - **Example bundle** — "Not sure yet? Start with sample data — you can change this in
      Settings later."
    - **Local directory** — inline input; hint: "A folder already on this server. Must
      contain at least one `.md` file."
    - **Clone a public git repo** — inline input; hint: "Public `https://` URL only. We clone
      it once; private/loopback hosts are rejected."
  - **Valid when:** `example` → always; `local` → `localPath.trim()` non-empty; `git` →
    `gitUrl.trim()` matches `^https://`.
- **Step 3 · Set an admin password**
  - *What:* the admin credential for this hub. *Why:* changing settings later (rename, rotate
    the token, switch bundle) requires it, so a visitor can't reconfigure your hub. *How:* at
    least 8 characters.
  - A compact read-only **summary** sits just above the finish button ("You're about to
    create — Workspace: *X* · Bundle: *example*"), folding "review" in without a 4th step.
  - **Valid when:** `adminPassword.length >= 8` (inline length hint shown while short).

**Submit:** on Step 3 "Finish setup" calls `onComplete(input)`. On `{ok:false}` the error text
renders on Step 3 (plain language; server messages like "directory contains no .md files",
"only https:// git URLs are allowed", "URL host is not allowed …" pass through). On `{ok:true}`
transition to the **done** screen.

## Component 2 — Completion screen (restructured, part of `SetupWizard` done state)

"Setup complete ✓", then three labeled sections:

1. **Your ingestion token** — *what:* a bearer credential agents use to read/write this hub
   via MCP + REST. *why copy now:* it is shown once and stored only as a hash. Token in a box
   with a **Copy** button (`navigator.clipboard.writeText`, shows "Copied!" for ~2s).
2. **Connect an agent** — the `claude mcp add …` command in a box with a **Copy** button, and
   one line: "Run this where Claude Code is installed."
3. **What's next** — links: "Browse the hub →" (`/`), "Work timeline →" (`/work`),
   "Manage settings →" (`/setup`).

## Component 3 — `AdminLogin` (new client component)

**File:** `app/components/admin-login.tsx`. **Prop:** `onLogin: (password: string) => Promise<{ ok: boolean; error?: string }>` (wired to the `adminLogin` server action from the page).

- Renders the intro copy: "This hub is already configured. Enter the admin password to change
  settings." + password field + "Log in".
- On submit: `const res = await onLogin(pw)`. If `res.ok` → `router.refresh()` (re-renders the
  server page; the freshly-set cookie now makes `isAdmin()` true → settings view). Else show
  `res.error` ("wrong password") inline via `role="alert"`.
- `busy` state disables the button while pending.

`app/setup/page.tsx` renders `<AdminLogin onLogin={adminLogin} />` in the not-yet-admin branch
instead of the inline server-action `<form>`.

## Component 4 — Settings view copy (in `app/setup/page.tsx`)

Keep the existing three controls; add clarity:
- Short intro under the "Settings — <workspace>" heading: "Signed in as admin. Changes take
  effect immediately."
- **Rename** — label hint: "Shown in the header and here."
- **Rotate token** — already the `RotateTokenPanel`; its warning ("the old token stops working
  immediately") stays; keep the one-time new-token display + Copy (reuse the Copy affordance).
- **Change bundle** — one line explaining each source (example / local path / git url), same
  wording as the wizard's Step 2 hints.
- Provide light success feedback where a server action returns (e.g. rename → the heading
  reflects the new name after the action re-renders).

## Styling

Extend the existing `.okf-setup*` classes in `app/globals.css`. New pieces:
- `.okf-setup__steps` (progress header: dots + "Step N of M · title").
- `.okf-setup__help` (the What/Why/How block: muted, small, with `dt/dd`-style or labeled lines).
- `.okf-setup__hint` (per-option one-liners).
- `.okf-setup__nav` (Back/Next row).
- `.okf-setup__copy` (Copy button + "Copied!" state).
- `.okf-setup__summary` (Step 3 review block).
Reuse `--okf-accent`, `--okf-muted`, `--okf-border`, `--okf-warn`, `--okf-ink` tokens.

## Data flow (unchanged backend)

`SetupWizard` → `onComplete(SetupInput)` → `completeSetup` (server action) → returns
`{ok, token, mcpCommand}`. `AdminLogin` → `onLogin(password)` → `adminLogin` → `{ok, error?}`.
Rotate/rename/changeBundle server actions unchanged. Client-side only additions: step index +
per-step validation, clipboard copy, and `router.refresh()` after login.

## Error handling

- **Client, per step:** Next is disabled until the current step passes its validity check;
  short inline hints explain what's needed (e.g. "at least 8 characters").
- **Server, at finish:** `completeSetup` failure text shown on Step 3 in plain language.
- **Login:** wrong password shown inline; never reveals whether the hub is configured beyond
  the existing "not configured" path.

## Testing

- **`app/components/setup-wizard.test.tsx`** (jsdom): (a) starts on Step 1 with Next disabled
  until a name is entered; (b) Back/Next navigation; (c) choosing "local"/"git" requires the
  respective input before Next; (d) completing all steps calls `onComplete` with the correct
  `SetupInput`; (e) success shows the token, the mcp command, and a Copy button; (f) a
  `{ok:false}` result shows the error on the finish step.
- **`app/components/admin-login.test.tsx`** (new, jsdom): wrong password (`{ok:false}`) shows
  the inline error; correct password (`{ok:true}`) calls the success path (mock
  `next/navigation`'s `useRouter().refresh`).
- Settings-copy changes are static text — covered by the existing page build/smoke; no new unit
  test required beyond the nav test.
- **Runtime smoke (before merge):** re-run the M4a controller smoke in the browser — walk the
  3 steps, finish, copy the token, then verify token drives REST+MCP; log in with a wrong then
  correct password (inline error, then settings appears without a manual reload).

## Files touched

- Modify: `app/components/setup-wizard.tsx` (stepper + completion), `app/setup/page.tsx`
  (use `AdminLogin`; settings copy), `app/globals.css` (new classes),
  `app/components/setup-wizard.test.tsx`.
- Create: `app/components/admin-login.tsx`, `app/components/admin-login.test.tsx`.
- Unchanged: everything under `lib/`, `app/lib/setup-actions.ts`, `app/lib/admin-session.ts`.

## Commit / branch

Continue on `feat/m4a-web-setup` (PR #1 is open and unmerged; this improves the same wizard).
Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
