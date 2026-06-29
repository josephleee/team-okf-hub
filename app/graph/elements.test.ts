import { describe, it, expect } from 'vitest';
import { toCytoscapeElements } from './elements';

describe('toCytoscapeElements', () => {
  it('produces one node element per node and one edge element per edge', () => {
    const els = toCytoscapeElements({
      nodes: [
        { path: 'a.md', title: 'A', type: 'X' },
        { path: 'b.md', title: 'B', type: 'Y' },
      ],
      edges: [{ from: 'a.md', to: 'b.md' }],
    });
    const nodes = els.filter((e) => !e.data.source);
    const edges = els.filter((e) => e.data.source);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.data).toMatchObject({ id: 'a.md', label: 'A' });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.data).toMatchObject({ source: 'a.md', target: 'b.md' });
  });
});
