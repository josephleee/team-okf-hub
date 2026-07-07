# In-App Usage Guide — Design

**Goal:** The service itself guides users through setup → connect → verify → use, so nobody
needs to leave the app (or ask an AI) to figure out what a token is for, why a bundle path was
rejected, or what to do on an empty screen. Driven by three observed pain points from real use:
(1) "path does not exist" taught nothing; (2) a freshly issued token came with no way to verify
it works; (3) empty screens don't say what to do next.

**Form (locked):** contextual guidance at the moments it's needed **plus** a hub-level `/guide`
page. English UI (consistent with the app). No new dependencies. No backend logic changes
(error-message strings in `lib/bundle-source.ts` are the only non-UI edits).

**Branch:** `feat/usage-guide`, stacked on `feat/m5-workspaces` (PR #3 scope stays frozen).
Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 1. `lib/agent-commands.ts` — one source of truth for agent commands

A pure, client-safe helper (no server imports) that builds every command the UI shows:

```ts
export interface AgentCommands {
  mcpAdd: string;      // claude mcp add --transport http okf-<slug> <origin>/w/<slug>/api/mcp --header "Authorization: Bearer <token>"
  curlRecord: string;  // curl -X POST <origin>/w/<slug>/api/v1/work ... -d '{"title":"hello","summary":"first record","actor":"me"}'
  curlSearch: string;  // curl '<origin>/w/<slug>/api/v1/search?q=hello'
}
export function buildAgentCommands(origin: string, slug: string, token?: string): AgentCommands
```

- `token` omitted → the literal placeholder `<TOKEN>` is embedded (used by `/guide`, since only
  hashes are stored).
- `origin` is passed in by callers: client components use `window.location.origin`, the `/guide`
  server component derives it from request headers. **This replaces the hardcoded
  `http://localhost:3000`** in user-visible commands, so commands are correct on any deployment.
- `app/lib/setup-actions.ts`'s `buildMcpCommand` stays as-is (its return value keeps existing
  tests passing), but the UI stops rendering it — every command shown to a user comes from
  `buildAgentCommands`.

## 2. `AgentSnippets` — "verify it now" block at every token-issuance moment

`app/components/agent-snippets.tsx` (client): props `{ slug: string; token: string }`. Renders
three labeled copy rows (reusing `CopyButton`), each with a one-line expected outcome:

1. **Connect an agent** — `mcpAdd` · "Run where Claude Code is installed."
2. **Test a write** — `curlRecord` · "Expect HTTP 201 — then see it on the Work timeline."
3. **Test a read** — `curlSearch` · "Expect JSON with hits."

Used in all three token moments:
- **Wizard completion** (`SetupDone` in `setup-wizard.tsx`): replaces the current single
  mcp-command block. Needs the slug → `completeSetup`'s success return gains `slug`
  (additive: `{ ok: true; slug; token; mcpCommand }`; existing assertions keep passing).
- **Add-workspace success** (`add-workspace.tsx`): replaces its inline mcp block (slug already
  in the result).
- **Rotate success** (`rotate-token.tsx`): currently shows only the bare token — gains
  `slug: string` prop (page passes `ws.slug`) and renders `AgentSnippets` under the new token,
  plus one line: "Update your agent: re-run the connect command with the new token."

## 3. Bundle-path guidance that teaches

- **Hints** (wizard step 2 local option, `AddWorkspacePanel` local option, settings
  change-bundle form) upgraded to:
  "Absolute path on the server — `~` is not expanded. Needs at least one `.md` file at its top
  level. e.g. `/srv/okf-bundle`."
- **Error strings in `lib/bundle-source.ts`** include the fix:
  - `path does not exist: <p> — use an absolute path on the server (~ is not expanded)`
  - `directory contains no .md files — add at least one .md at the top level`
  Existing tests assert `.ok` flags only; new assertions cover the guidance text.

## 4. Empty states that say what to do next

`work-timeline.tsx` empty state upgrades from one sentence to: the sentence + a copy-paste
`curlRecord` example (built with `window.location.origin` → requires making the empty-state
block a small client component or passing origin — the WorkTimeline is already a client-rendered
component tree; use `buildAgentCommands` with `window.location.origin` guarded for SSR:
`typeof window === 'undefined' ? '' : window.location.origin`, rendering the command only after
mount to avoid hydration mismatch) + a "Read the guide →" link to `/guide`.
(WorkTimeline is currently a server-rendered presentational component — if it is not a client
component, wrap ONLY the curl-example line in a tiny client child `WorkEmptyHint` instead of
converting the whole timeline.)

## 5. `/guide` page + nav link

`app/guide/page.tsx` (server component, `dynamic = 'force-dynamic'`), nav gains `Guide` link
(after Work). Origin derived server-side: `x-forwarded-proto`/`x-forwarded-host` falling back to
the `host` header, `http` default. Sections:

1. **How this hub works** — 4 lines: bundle (markdown concepts) → hub (browse/search/graph) →
   agents (MCP/REST) → work records flow back in.
2. **Connect an agent** — one card per workspace (name, slug, default badge): real
   `mcpAdd` command with `<TOKEN>` placeholder + note: "The token was shown once when the
   workspace was created (or last rotated). Lost it? Rotate in Settings." + that workspace's
   API base URLs.
3. **Record & query work** — `curlRecord` / `curlSearch` with `<TOKEN>` for the default
   workspace, expected outcomes, link to `/work`.
4. **Manage workspaces** — 3 bullets (add/rotate/default) + link to `/setup`.
5. **Troubleshooting** — table: `401` wrong/other-workspace token · `503` ingestion not
   configured · `404 unknown workspace` bad slug · path rules (absolute, no `~`, needs `.md`).

States: first-run → `redirect('/setup')`. Env-configured or no-config-with-env: render with a
single legacy card (`/api/...` URLs, note that env vars configure this instance). Configured:
cards per workspace.

## 6. Testing

- `lib/agent-commands.test.ts` — commands contain origin/slug/token, `<TOKEN>` placeholder when
  omitted; no trailing-newline surprises.
- `app/components/agent-snippets.test.tsx` (jsdom) — renders 3 copy rows with token+slug baked
  in; CopyButtons present.
- Update `setup-wizard.test.tsx` completion assertions (mcp command now contains the jsdom
  origin `http://localhost:3000` — jsdom default origin — and the three snippet rows),
  `add-workspace.test.tsx`, `rotate-token.test.tsx` (snippets after rotate).
- `lib/bundle-source.test.ts` — new error-string assertions.
- `nav.test.tsx` — Guide link.
- `/guide` render is covered by typecheck + build + the final runtime smoke (browser: guide
  shows one card per workspace with correct URLs; empty /work shows the curl example).

## 7. Out of scope (YAGNI)

No i18n/Korean toggle; no interactive tour/checklist state; no token retrieval (hashes only —
the guide links to rotate instead); no docs-site — `/guide` is one page.
