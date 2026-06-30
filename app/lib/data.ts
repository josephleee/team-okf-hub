import type { OkfService } from '../../lib/okf-service';

const titleOf = (path: string, title: string | null): string => title ?? path;

export interface HomeGroup {
  type: string;
  concepts: { path: string; title: string }[];
}

export function homeView(svc: OkfService): HomeGroup[] {
  const byType = new Map<string, { path: string; title: string }[]>();
  for (const c of svc.concepts()) {
    const list = byType.get(c.type) ?? [];
    list.push({ path: c.path, title: titleOf(c.path, c.title) });
    byType.set(c.type, list);
  }
  return [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, concepts]) => ({ type, concepts }));
}

export interface ConceptView {
  path: string;
  type: string;
  title: string;
  description: string | null;
  resource: string | null;
  tags: string[];
  timestamp: string | null;
  html: string;
  outbound: { path: string; title: string; type: string }[];
  backlinks: { path: string; title: string; type: string }[];
}

export function conceptView(svc: OkfService, path: string): ConceptView | null {
  const row = svc.concept(path);
  if (!row) return null;

  let tags: string[] = [];
  try {
    const fm = JSON.parse(row.frontmatter_json) as { tags?: unknown };
    if (Array.isArray(fm.tags)) tags = fm.tags.filter((t): t is string => typeof t === 'string');
  } catch {
    tags = [];
  }

  const neighborhood = svc.graph(path, 1);
  const titleByPath = new Map(neighborhood.nodes.map((n) => [n.path, titleOf(n.path, n.title)]));
  const typeByPath = new Map(neighborhood.nodes.map((n) => [n.path, n.type]));
  const outbound = neighborhood.edges
    .filter((e) => e.from === path)
    .map((e) => ({ path: e.to, title: titleByPath.get(e.to) ?? e.to, type: typeByPath.get(e.to) ?? '' }));

  const backlinks = svc.backlinks(path).map((b) => ({ path: b.path, title: titleOf(b.path, b.title), type: b.type }));

  return {
    path: row.path,
    type: row.type,
    title: titleOf(row.path, row.title),
    description: row.description,
    resource: row.resource,
    tags,
    timestamp: row.timestamp,
    html: row.body_html,
    outbound,
    backlinks,
  };
}

export interface SearchView {
  query: string;
  hits: { path: string; title: string; type: string; snippet: string }[];
}

export function searchView(svc: OkfService, query: string): SearchView {
  const hits = svc.search(query).map((h) => ({
    path: h.path,
    title: titleOf(h.path, h.title),
    type: h.type,
    snippet: h.snippet,
  }));
  return { query, hits };
}

export interface GraphView {
  nodes: { path: string; title: string; type: string }[];
  edges: { from: string; to: string }[];
}

export function graphView(svc: OkfService): GraphView {
  const g = svc.fullGraph();
  return {
    nodes: g.nodes.map((n) => ({ path: n.path, title: titleOf(n.path, n.title), type: n.type })),
    edges: g.edges,
  };
}
