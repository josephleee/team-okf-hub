import type { DB } from './schema';

export const SNIPPET_OPEN = '\x02';
export const SNIPPET_CLOSE = '\x03';

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
        `SELECT DISTINCT c.path, c.type, c.title FROM concepts c
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
              snippet(concepts_fts, 3, char(2), char(3), '…', 12) AS snippet
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
      `SELECT DISTINCT c.path, c.type, c.title FROM links l
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
    const key = `${e.from}\t${e.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, edges: uniqueEdges };
}

export function graphAll(db: DB): GraphData {
  const nodes = db.prepare('SELECT path, type, title FROM concepts ORDER BY path').all() as ConceptSummary[];
  const rows = db
    .prepare('SELECT DISTINCT src_path, dst_path FROM links WHERE resolved = 1 AND dst_path IS NOT NULL')
    .all() as { src_path: string; dst_path: string }[];
  return { nodes, edges: rows.map((r) => ({ from: r.src_path, to: r.dst_path })) };
}
