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
