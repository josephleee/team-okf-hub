import { describe, it, expect } from 'vitest';
import { buildBundle } from './bundle';
import type { RawFile } from './types';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\n---\nLinks to [c](customers.md) and [missing](ghost.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\n---\nNo type problems.' },
  { path: 'bad.md', content: '---\ntitle: no type\n---\nbody' },
];

describe('buildBundle', () => {
  it('parses every file into a concept', () => {
    const b = buildBundle(FILES);
    expect(b.concepts.map((c) => c.path)).toEqual(['tables/orders.md', 'tables/customers.md', 'bad.md']);
  });

  it('resolves links against the set of concept paths', () => {
    const b = buildBundle(FILES);
    const resolved = b.links.filter((l) => l.resolved).map((l) => l.to);
    expect(resolved).toEqual(['tables/customers.md']);
  });

  it('emits a warning for a broken internal link', () => {
    const b = buildBundle(FILES);
    expect(b.issues).toContainEqual(
      expect.objectContaining({ path: 'tables/orders.md', severity: 'warning', field: 'link' }),
    );
  });

  it('emits a type error for the concept missing a type', () => {
    const b = buildBundle(FILES);
    expect(b.issues).toContainEqual(
      expect.objectContaining({ path: 'bad.md', severity: 'error', field: 'type' }),
    );
  });
});
