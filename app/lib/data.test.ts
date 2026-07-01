import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'node:path';
import { createService } from '../../lib/okf-service';
import { homeView, conceptView, searchView, graphView, escapeSnippet, workView } from './data';
import type { WorkRow } from '../../lib/db/queries';

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

describe('escapeSnippet', () => {
  it('escapes HTML in snippet text but turns the sentinel markers into <mark>', () => {
    const raw = 'a <b> \x02hit\x03 & c';
    expect(escapeSnippet(raw)).toBe('a &lt;b&gt; <mark>hit</mark> &amp; c');
  });
});

describe('workView', () => {
  const rows: WorkRow[] = [
    { path: 'work/a/2026-07-02-090000-two.md', title: 'Two', actor: 'bob', project: 'a', timestamp: '2026-07-02T09:00:00Z', tags: [], artifacts: [] },
    { path: 'work/a/2026-07-01-090000-one.md', title: 'One', actor: 'alice', project: 'a', timestamp: '2026-07-01T09:00:00Z', tags: ['fix'], artifacts: ['https://x/1'] },
    { path: 'work/a/2026-07-02-100000-three.md', title: 'Three', actor: 'alice', project: 'a', timestamp: '2026-07-02T10:00:00Z', tags: [], artifacts: [] },
  ];

  it('groups by date descending and carries the filter + total', () => {
    const v = workView(rows, { project: 'a' });
    expect(v.total).toBe(3);
    expect(v.filter.project).toBe('a');
    expect(v.groups.map((g) => g.date)).toEqual(['2026-07-02', '2026-07-01']);
    expect(v.groups[0]!.items.map((i) => i.title)).toEqual(['Two', 'Three']);
  });

  it('falls back to path when a title is null', () => {
    const v = workView([{ path: 'work/x.md', title: null, actor: null, project: null, timestamp: null, tags: [], artifacts: [] }]);
    expect(v.groups[0]!.items[0]!.title).toBe('work/x.md');
    expect(v.groups[0]!.date).toBe('undated');
  });
});
