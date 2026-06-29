import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { createService } from '../../lib/okf-service';
import { homeView, conceptView, searchView, graphView } from './data';

const svc = await createService(join(process.cwd(), 'bundles/example'));
afterAll(() => svc.close());

describe('view models', () => {
  it('homeView groups concepts by type', () => {
    const groups = homeView(svc);
    const types = groups.map((g) => g.type);
    expect(types).toContain('BigQuery Table');
    const tableGroup = groups.find((g) => g.type === 'BigQuery Table')!;
    expect(tableGroup.concepts.map((c) => c.path).sort()).toEqual([
      'tables/customers.md', 'tables/orders.md',
    ]);
    expect(tableGroup.concepts[0]!.title.length).toBeGreaterThan(0);
  });

  it('conceptView returns rendered html, metadata, outbound links and backlinks', () => {
    const v = conceptView(svc, 'tables/orders.md')!;
    expect(v.type).toBe('BigQuery Table');
    expect(v.title).toBe('Orders');
    expect(v.html).toContain('<table>');
    expect(v.tags).toContain('sales');
    expect(v.outbound.map((o) => o.path)).toContain('tables/customers.md');
    expect(v.backlinks.map((b) => b.path)).toContain('metrics/weekly_active_users.md');
  });

  it('conceptView returns null for an unknown concept', () => {
    expect(conceptView(svc, 'nope/missing.md')).toBeNull();
  });

  it('searchView returns hits with snippets', () => {
    const v = searchView(svc, 'customers');
    expect(v.query).toBe('customers');
    expect(v.hits.length).toBeGreaterThan(0);
    expect(v.hits[0]!.title.length).toBeGreaterThan(0);
  });

  it('searchView returns no hits for an empty query', () => {
    expect(searchView(svc, '   ').hits).toEqual([]);
  });

  it('graphView returns all nodes and edges', () => {
    const g = graphView(svc);
    expect(g.nodes.length).toBe(5);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.nodes[0]).toHaveProperty('title');
  });
});
