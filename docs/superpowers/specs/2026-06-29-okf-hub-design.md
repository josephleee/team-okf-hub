# OKF Hub — Design Spec

- **Status:** Approved (design phase) — implementation not yet started
- **Date:** 2026-06-29
- **Author:** Joseph (`josephleee`)
- **Repo:** https://github.com/josephleee/team-okf-hub

---

## 1. Summary

**OKF Hub** is a self-hostable, open-source web service that turns a team's
**Open Knowledge Format (OKF)** bundle — a git repository of Markdown files with
YAML frontmatter — into a living knowledge hub. A team can browse, search, and
navigate the concept graph, edit concepts through a pull-request flow, and serve
that knowledge to AI agents over **MCP** and **REST**.

The defining constraint: **git is the source of truth.** The Hub is a
read / write / serve layer on top of a plain OKF git repo. Everything the Hub
stores beyond the repo (a SQLite index) is a disposable cache that can be
rebuilt from git at any time.

## 2. Background — what is OKF

The Open Knowledge Format (OKF, v0.1) is an open specification published by
Google Cloud that formalizes how organizational knowledge (table schemas, metric
definitions, runbooks, business rules) is represented as portable, vendor-neutral
files that both humans and AI agents can consume.

Core properties:

- Each **concept** is one Markdown file with YAML frontmatter.
- The **only required frontmatter field is `type`**. `title`, `description`,
  `resource`, `tags`, `timestamp` are optional, agreed-upon queryable fields.
- The Markdown body is free-form (human-readable, agent-parseable).
- Concepts link to each other with ordinary Markdown links, forming a **graph**.
- Optional `index.md` (navigation) and `log.md` (chronological history) files.
- "Just files, just Markdown" — shippable as a tarball, hostable in a git repo,
  renderable on GitHub.

Reference: <https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf>

## 3. Goals / Non-goals

**Goals (v1)**

- Make a team's OKF bundle browsable, searchable, and graph-navigable in a web UI.
- Let team members author/edit OKF concepts safely (validated) via a PR flow.
- Serve the bundle to AI agents (Claude, etc.) over MCP and a read-only REST API.
- Keep git as the single source of truth; never lock knowledge into a database.
- Be trivially self-hostable (Docker, env config).

**Non-goals (v1)**

- Multi-tenant SaaS (one deployment = one team = one OKF repo).
- Semantic/vector search (keyword FTS only in v1).
- Auto-generating OKF concepts from data sources (the "enrichment agent" is v2+).
- Real-time collaborative editing.

## 4. Locked decisions

| Area | Decision |
|------|----------|
| Source of truth | **Git repo** of OKF files; SQLite is a regenerable cache |
| Stack | **Next.js (App Router) + TypeScript** — UI + REST + MCP in one app |
| Auth | **GitHub OAuth**, single workspace; authorization = repo membership/allowlist |
| Editing | Inline edit → **branch + commit + PR** (via the acting user's OAuth token), gated by validation |
| Search | **SQLite FTS5** keyword search (semantic/hybrid deferred to v2) |
| License | **Apache-2.0** |
| Deploy | Docker + docker-compose, env-configured |

## 5. Architecture

A single Next.js (App Router, TypeScript) application serves three surfaces:

- **Web UI** — React Server Components + client islands.
- **REST API** — `/api/*` (read-only knowledge API for non-MCP agents/tools).
- **MCP endpoint** — `/api/mcp` (streamable HTTP MCP) for AI agents.

Supporting layers:

- **Git layer.** The server keeps a local clone of the configured workspace repo
  (`OKF_REPO`). Reads come from the working tree. Writes go through the GitHub API
  **as the acting user** (their OAuth token), creating a branch, committing the
  changed file, and opening a PR — so commit authorship is the real user. A push
  webhook (with a poll fallback and a manual "Resync" action) keeps the local
  clone and the index synchronized with upstream.
- **Index / cache.** SQLite (`better-sqlite3`) holds parsed concepts, frontmatter
  fields, link edges (the graph), and an FTS5 full-text index. It is built from
  git and is always disposable — corruption or drift is fixed by a resync, never
  by data recovery.
- **Auth.** GitHub OAuth via Auth.js. Authorization checks workspace-repo
  membership/collaborator status (or an `ALLOWLIST` env for closed setups).

```
                ┌────────────────────────── Next.js app ──────────────────────────┐
   Browser ───▶ │  Web UI (RSC)   REST /api/*   MCP /api/mcp                       │
   AI agent ──▶ │        │             │              │                            │
                │        ▼             ▼              ▼                            │
                │   ┌─────────────── index (SQLite: concepts, links, FTS5) ──────┐ │
                │   └──────────▲───────────────────────────▲────────────────────┘ │
                │              │ build/update              │ queries               │
                │   ┌──────────┴───────────┐    ┌──────────┴──────────┐            │
                │   │ okf-core (parse/      │    │ git-workspace       │            │
                │   │ validate/graph, pure) │    │ (clone/pull/PR)     │            │
                │   └──────────────────────┘    └──────────┬──────────┘            │
                └───────────────────────────────────────────┼───────────────────────┘
                                                             │ clone / PR (user token) / webhook
                                                             ▼
                                            GitHub: OKF workspace repo (source of truth)
```

## 6. Data model

- **Concept** — one Markdown file. Parsed into: `path`, `type` (required),
  `title`, `description`, `resource`, `tags[]`, `timestamp`, arbitrary extra
  frontmatter, raw Markdown body, rendered HTML, and resolved outbound links.
- **Graph** — nodes are concepts; edges are resolved internal Markdown links.
  Link integrity is tracked; unresolved links are flagged (warning, not fatal).
  `index.md` / `log.md` are handled specially (navigation / history).
- **Bundle** — the whole repo tree, namespaced by directory
  (e.g. `sales/tables/orders.md`).

**SQLite schema (cache):**

- `concepts(path PK, type, title, description, resource, timestamp, frontmatter_json, body_md, body_html, parse_error)`
- `tags(concept_path, tag)` — for tag filtering
- `links(src_path, dst_path, dst_raw, resolved)` — the graph + broken-link tracking
- `concepts_fts` — FTS5 virtual table over `title`, `description`, `body_md`, `tags`
- `sync_state(key, value)` — last synced commit SHA, last sync time

## 7. Modules (isolation boundaries)

- **`okf-core`** (pure library, no I/O) — frontmatter parsing, `type`/required-field
  validation, link resolution, graph construction. Fully unit-testable; the
  reusable heart of the system; can be published as a standalone package later.
- **`git-workspace`** — clone, pull, branch, commit-via-GitHub-API, open PR,
  webhook signature verification. Wraps the GitHub API + a git client.
- **`index`** — build/update the SQLite cache from parsed concepts; search and
  graph queries.
- **`app/`** — UI pages (Home/index, Concept view, Search, Graph explorer, Editor)
  and route handlers (REST, MCP).
- **`auth`** — Auth.js configuration + repo-membership guard.

Each module answers: what it does, how you call it, what it depends on — and can
be understood/tested without reading the others' internals.

## 8. Key flows

- **Browse** — request → SQLite index → render concept (Markdown → HTML) with
  metadata, backlinks, outbound links, and a graph neighborhood preview.
- **Search** — query → FTS5 → ranked concept list (filterable by `type` / `tags`).
- **Graph explorer** — interactive graph (Cytoscape.js or react-force-graph) built
  from the `links` table; clicking a node opens the concept.
- **Edit → PR** — open a concept in the editor (Markdown body + frontmatter form) →
  live validation via `okf-core` (type required, link integrity, frontmatter
  shape) → Save creates branch `okf-edit/<user>/<slug>`, commits the changed file
  via the GitHub API (authored by the user's token), and opens a PR → returns the
  PR link. Creating a new concept follows the same flow (choose `type` + directory).
- **Sync** — push webhook on the default branch → verify signature → pull the
  clone → re-parse changed files → update SQLite + FTS. Fallback: periodic poll.
  Plus a manual "Resync" button.
- **Agent / MCP** — `/api/mcp` exposes tools:
  `okf_search(query, type?, tags?)`, `okf_get(path)`, `okf_list(type?, tag?)`,
  `okf_graph(path, depth?)`. A read-only REST mirror lives under `/api/v1/*` for
  non-MCP consumers. Agent auth via a UI-issued token or the session cookie.

## 9. Validation rules (shared by editor + CI)

Implemented once in `okf-core`, reused both in the editor (pre-PR gate) and as a
GitHub Action so the same rules guard both authoring paths:

- `type` is **required** (error if missing).
- Frontmatter must be valid YAML; known fields are type-checked
  (`tags` = list, `timestamp` = ISO-8601, `resource` = URL).
- Internal Markdown links must resolve to existing concept files
  (unresolved link = warning, surfaced in the UI and in CI).
- Malformed concepts are still listed but flagged with a parse error; they never
  break the rest of the bundle.

## 10. Error handling

- **Git / GitHub API failures** → surfaced with retry. Writes are atomic per PR;
  since git is the source of truth there is no partial in-app state to reconcile.
- **Index drift / corruption** → "Resync"; the index is always regenerable.
- **Auth failures** → redirect to login; non-members get a clear `403`.
- **Concept parse errors** → file remains listed and flagged, bundle stays healthy.

## 11. Testing strategy

- **Unit (TDD):** `okf-core` — parsing, validation, link resolution, graph build —
  against fixture bundles.
- **Integration:** index build from a fixture repo; search and graph queries; MCP
  tool handlers.
- **E2E (later):** edit → PR flow against a test repo (mocked GitHub API).
- A small **sample bundle** (`bundles/example/`, an "acme sales" OKF set) ships for
  demos and tests.

## 12. Repo layout

```
team-okf-hub/
├── README.md  LICENSE(Apache-2.0)  NOTICE  CONTRIBUTING.md
├── .github/workflows/   # CI: lint · test · okf-validate · docker build
├── docker/              # Dockerfile, docker-compose.yml
├── docs/                # architecture, deployment, OKF spec notes, specs/
├── packages/okf-core/   # pure parse · validate · graph library
├── app/                 # Next.js app (UI + API + MCP)
├── lib/                 # git-workspace, index, auth
├── bundles/example/     # sample OKF bundle
└── scripts/
```

(Start as a single Next.js app with `okf-core` as an internal package; split into
a pnpm workspace only if/when it earns its keep.)

## 13. v1 scope and milestones

**v1 scope:** git-backed browse/render/backlinks · FTS5 search · graph explorer ·
inline edit → validation → PR · GitHub OAuth + single-workspace auth · MCP + REST ·
webhook/poll sync + Resync · Docker deploy · sample bundle · CI with `okf-validate`.

The implementation plan will sequence v1 into buildable milestones (scope
unchanged, just ordered):

- **M1 — Foundations & read path.** `okf-core` (TDD) + index + browse/search/graph
  on a local clone (no auth, no writes yet). Proves the core value end-to-end.
- **M2 — Auth & write path.** GitHub OAuth + membership guard; editor → validation
  → branch/commit/PR.
- **M3 — Agents, sync & ship.** MCP + REST endpoints; webhook/poll sync + Resync;
  Docker + docker-compose; CI; sample bundle; docs.

**Roadmap (v2+):** semantic/hybrid search (embeddings) · multi-tenant · OKF
enrichment agent (auto-draft concepts from data sources) · real-time collaborative
editing · finer-grained RBAC.

## 14. Open questions

- Project naming is settled as **`team-okf-hub`** (GitHub repo). A shorter product
  name ("OKF Hub") is used in prose.
- Git client choice (`isomorphic-git` vs `simple-git`) and graph library
  (Cytoscape.js vs react-force-graph) are implementation details, decided during M1.
- Whether to ship a GitHub App (cleaner installation/write story) in addition to
  pure OAuth — evaluated in M2.
