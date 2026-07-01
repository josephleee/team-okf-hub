# OKF Hub

> A self-hostable, open-source knowledge hub for teams, built on the
> **Open Knowledge Format (OKF)**.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Status](https://img.shields.io/badge/status-early%20development-orange.svg)

OKF Hub turns a team's OKF bundle — a git repository of Markdown files with YAML
frontmatter — into a living knowledge hub: **browse**, **search**, and navigate
the **concept graph**, **edit** through a pull-request flow, and **serve the
knowledge to AI agents** over MCP and REST.

The guiding principle: **git is the source of truth.** OKF Hub is a
read / write / serve layer on top of a plain OKF git repo. The only thing it
stores beyond your repo is a disposable SQLite index that can be rebuilt from git
at any time. Your knowledge is never locked into a database.

> **Status: 🚧 Early development.** The design is complete (see
> [`docs/superpowers/specs/`](docs/superpowers/specs/)); implementation is just
> starting. Features below describe the **planned v1** — they are not all working
> yet.

## What is OKF?

The [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF, v0.1) is an open specification from Google Cloud for representing
organizational knowledge — table schemas, metric definitions, runbooks, business
rules — as portable, vendor-neutral files that both humans and AI agents can read.

- Each **concept** is one Markdown file with YAML frontmatter.
- The only **required** field is `type`. `title`, `description`, `resource`,
  `tags`, and `timestamp` are optional, agreed-upon queryable fields.
- Concepts link to each other with ordinary Markdown links, forming a graph.
- "Just files, just Markdown" — hostable in git, renderable on GitHub.

## Why OKF Hub?

Plain OKF files are great for portability, but a team needs more than a folder of
Markdown: a way to search across concepts, see how they connect, edit them without
breaking the format, and feed them to the AI agents that increasingly need that
context. OKF Hub adds that team layer **without giving up the git-native,
portable nature of OKF.**

## OKF vs. agent memory

As AI agents proliferate, a natural question is: why not just let each agent
*remember* the organization's knowledge in its own memory? The two serve
fundamentally different roles, and for **organizational knowledge shared across
multiple agents, OKF is the right layer** — not per-agent memory.

- **Agent memory** is private, self-authored, and unverified — it captures an
  agent's own working context and preferences ("this user commits with their
  personal identity"). Low friction to write, but not something other agents
  should trust as fact.
- **OKF** is shared, human-curated, and validated — one canonical source of
  truth that every agent, session, and teammate reads the same way, through a
  uniform interface (MCP `okf_search` / `okf_get` / `okf_list` / `okf_graph`).

The distinction matters most for multi-agent setups:

| Concern | Agent memory | OKF (via OKF Hub) |
|---|---|---|
| **Consistency** | Each agent may remember facts differently | One canonical definition for all |
| **Trust** | "probably right" | validated + PR-reviewed before it becomes canon |
| **Audit** | none | git history — who changed what, when, why |
| **Scope** | private to one agent/session | shared across the whole team |
| **Access** | ad-hoc, per-agent format | uniform MCP / REST interface |

Crucially, **agents don't write to OKF directly** — that would erode the very
guarantee (validated canon) that makes it trustworthy. Instead they propose
changes through the same **edit → PR** flow humans use, and a review gate decides
what becomes canon. Rule of thumb: an organization's *"what is true"* belongs in
OKF (shared, versioned, reviewed); an agent's *"what I'm working on / what this
user prefers"* stays in memory (private, low-friction).

## Planned features (v1)

- 📖 **Browse & render** — read concepts with metadata, backlinks, and outbound links.
- 🔎 **Full-text search** — fast keyword search (SQLite FTS5), filterable by type/tags.
- 🕸️ **Graph explorer** — navigate the concept graph interactively.
- ✏️ **Edit → PR** — in-browser editing with live validation, landing as a pull
  request (commit authored by the real user).
- 🔌 **Agent access** — an MCP endpoint (`okf_search`, `okf_get`, `okf_list`,
  `okf_graph`) plus a read-only REST API.
- 🔐 **GitHub auth** — sign in with GitHub; access scoped to your workspace repo.
- 🔄 **Git-native sync** — webhook + poll keep the index in sync with your repo.
- 🐳 **Self-host** — Docker + docker-compose, configured by env.

## How it works

```
Browser / AI agent  ─▶  OKF Hub (Next.js: UI + REST + MCP)  ─▶  SQLite index (cache)
                                      │
                                      ▼
                        GitHub: your OKF repo  ◀── source of truth
                        (reads via clone · writes via PR as you)
```

See [`docs/superpowers/specs/2026-06-29-okf-hub-design.md`](docs/superpowers/specs/2026-06-29-okf-hub-design.md)
for the full design.

## CLI (development)

```bash
npm install
npm run okf -- validate bundles/example   # validate an OKF bundle (exit 1 on errors)
npm run okf -- query bundles/example orders  # full-text search
npm run okf -- index bundles/example okf.sqlite  # build a SQLite index file
```

## Run the web app (M1b)

```bash
npm install
npm run dev          # http://localhost:3000
# OKF_BUNDLE_DIR=/path/to/your/okf-bundle npm run dev   # use your own bundle
```

Pages: `/` (browse by type) · `/concept/<path>` (rendered concept + backlinks) ·
`/search?q=` (full-text search) · `/graph` (interactive concept graph).

## Editing (M2a)

OKF Hub can edit concepts in the browser:

- Open a concept → **edit**, or **+ new** in the nav to create one.
- The editor validates live (the only required field is `type`) and shows a sanitized preview.
- **Save** writes the `.md` file in your bundle directory and re-indexes. **Commit with git** to persist:
  ```bash
  cd $OKF_BUNDLE_DIR && git add -A && git commit -m "edit via OKF Hub"
  ```

> Editing writes to your local bundle on disk. GitHub sign-in and automatic pull-request creation are a later milestone (M2b).

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

## Tech stack

Next.js (App Router) · TypeScript · SQLite (FTS5) · GitHub OAuth (Auth.js) ·
Model Context Protocol (MCP) · Docker.

## Roadmap

- **v1** — the features above (browse, search, graph, edit→PR, MCP/REST, self-host).
- **v2+** — semantic/hybrid search, multi-tenant, an OKF "enrichment agent" that
  drafts concepts from your data sources, real-time collaborative editing, finer RBAC.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). This project is
in its early design-to-implementation phase, so issues and discussion about the
design are especially valuable right now.

## License

[Apache-2.0](LICENSE).

OKF Hub is an independent open-source project and is not affiliated with or
endorsed by Google. "Open Knowledge Format" refers to the open specification
published by Google Cloud.
