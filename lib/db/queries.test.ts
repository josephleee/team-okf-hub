import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildBundle } from '../okf-core/bundle';
import type { RawFile } from '../okf-core/types';
import { buildIndex } from './build';
import { getConcept, listConcepts, searchConcepts, backlinks, graphNeighborhood } from './queries';

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
