import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildBundle } from '../okf-core/bundle';
import type { RawFile } from '../okf-core/types';
import { buildIndex } from './build';
import { initSchema } from './schema';
import { getConcept, listConcepts, searchConcepts, backlinks, graphNeighborhood, graphAll, recentWork } from './queries';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\ntitle: Orders\ntags: [sales]\n---\nOrders link to [c](customers.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\ntitle: Customers\ntags: [sales]\n---\nCustomers data.' },
  { path: 'metrics/wau.md', content: '---\ntype: Metric\ntitle: WAU\ntags: [engagement]\n---\nUses [orders](../tables/orders.md).' },
];

function db() {
  const d = new Database(':memory:');
  buildIndex(d, buildBundle(FILES));
  return d;
}

describe('queries', () => {
  it('getConcept returns a single concept with html', () => {
    const c = getConcept(db(), 'tables/orders.md');
    expect(c?.title).toBe('Orders');
    expect(c?.body_html).toContain('<p>');
  });

  it('listConcepts filters by type and by tag', () => {
    const d = db();
    expect(listConcepts(d, { type: 'Table' }).map((c) => c.path).sort()).toEqual([
      'tables/customers.md',
      'tables/orders.md',
    ]);
    expect(listConcepts(d, { tag: 'engagement' }).map((c) => c.path)).toEqual(['metrics/wau.md']);
  });

  it('searchConcepts finds concepts by full-text match with a snippet', () => {
    const hits = searchConcepts(db(), 'customers');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.snippet).toBeTruthy();
  });

  it('searchConcepts returns [] for an empty query', () => {
    expect(searchConcepts(db(), '   ')).toEqual([]);
  });

  it('backlinks returns concepts that link to a target', () => {
    const back = backlinks(db(), 'tables/orders.md').map((c) => c.path);
    expect(back).toContain('metrics/wau.md');
  });

  it('backlinks returns each source EXACTLY ONCE even when it links the target twice', () => {
    const FILES_DUP: RawFile[] = [
      {
        path: 'tables/customers.md',
        content: '---\ntype: Table\ntitle: Customers\n---\nCustomers data.',
      },
      {
        path: 'tables/orders.md',
        content:
          '---\ntype: Table\ntitle: Orders\n---\nLinks [a](customers.md) and again [b](customers.md).',
      },
    ];
    const d = new Database(':memory:');
    buildIndex(d, buildBundle(FILES_DUP));
    const back = backlinks(d, 'tables/customers.md').map((c) => c.path);
    expect(back.filter((p) => p === 'tables/orders.md')).toHaveLength(1);
  });

  it('graphNeighborhood returns the node and its immediate neighbors', () => {
    const g = graphNeighborhood(db(), 'tables/orders.md', 1);
    const ids = g.nodes.map((n) => n.path).sort();
    expect(ids).toContain('tables/orders.md');
    expect(ids).toContain('tables/customers.md');
    expect(ids).toContain('metrics/wau.md');
    expect(g.edges.length).toBeGreaterThan(0);
  });
});

describe('graphAll', () => {
  it('returns all concepts as nodes and all resolved links as edges', () => {
    const d = db();
    const g = graphAll(d);
    expect(g.nodes.map((n) => n.path).sort()).toEqual([
      'metrics/wau.md', 'tables/customers.md', 'tables/orders.md',
    ]);
    // orders -> customers (resolved) and wau -> orders (resolved)
    expect(g.edges).toContainEqual({ from: 'tables/orders.md', to: 'tables/customers.md' });
    expect(g.edges).toContainEqual({ from: 'metrics/wau.md', to: 'tables/orders.md' });
  });
});

describe('recentWork', () => {
  function seed() {
    const db = new Database(':memory:');
    initSchema(db);
    const ins = db.prepare(`INSERT INTO concepts
      (path, type, title, description, resource, timestamp, frontmatter_json, body_md, body_html, parse_error)
      VALUES (@path,@type,@title,null,null,@timestamp,@fm,'','',null)`);
    const rec = (path: string, title: string, ts: string, fm: object) =>
      ins.run({ path, type: 'WorkRecord', title, timestamp: ts, fm: JSON.stringify({ type: 'WorkRecord', title, ...fm }) });
    rec('work/a/2026-07-01-090000-first.md', 'First', '2026-07-01T09:00:00Z',
      { actor: 'alice', project: 'proj-a', tags: ['fix'], artifacts: ['https://x/1'] });
    rec('work/b/2026-07-02-090000-second.md', 'Second', '2026-07-02T09:00:00Z',
      { actor: 'bob', project: 'proj-b', tags: [], artifacts: [] });
    rec('work/a/2026-07-03-090000-third.md', 'Third', '2026-07-03T09:00:00Z',
      { actor: 'alice', project: 'proj-a', tags: ['feature'], artifacts: [] });
    // a non-WorkRecord concept that must be excluded
    ins.run({ path: 'tables/orders.md', type: 'table', title: 'Orders', timestamp: '2026-07-04T00:00:00Z',
      fm: JSON.stringify({ type: 'table', actor: 'alice' }) });
    return db;
  }

  it('returns only WorkRecords, newest first', () => {
    const db = seed();
    const rows = recentWork(db);
    expect(rows.map((r) => r.title)).toEqual(['Third', 'Second', 'First']);
    db.close();
  });

  it('parses actor, project, tags, artifacts from frontmatter', () => {
    const db = seed();
    const first = recentWork(db).find((r) => r.title === 'First')!;
    expect(first.actor).toBe('alice');
    expect(first.project).toBe('proj-a');
    expect(first.tags).toEqual(['fix']);
    expect(first.artifacts).toEqual(['https://x/1']);
    db.close();
  });

  it('filters by project and actor', () => {
    const db = seed();
    expect(recentWork(db, { project: 'proj-a' }).map((r) => r.title)).toEqual(['Third', 'First']);
    expect(recentWork(db, { actor: 'bob' }).map((r) => r.title)).toEqual(['Second']);
    db.close();
  });

  it('respects limit', () => {
    const db = seed();
    expect(recentWork(db, { limit: 1 }).map((r) => r.title)).toEqual(['Third']);
    db.close();
  });

  it('clamps negative limit to 1', () => {
    const db = seed();
    const rows = recentWork(db, { limit: -5 });
    expect(rows.length).toBeLessThanOrEqual(1);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it('clamps oversized limit to 500 (returns all 3 seeded rows)', () => {
    const db = seed();
    const rows = recentWork(db, { limit: 9999 });
    expect(rows.length).toBe(3);
    expect(rows.length).toBeLessThanOrEqual(500);
    db.close();
  });
});
