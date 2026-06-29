import { describe, it, expect } from 'vitest';
import { extractLinks, resolveLink } from './links';

const KNOWN = new Set(['tables/orders.md', 'tables/customers.md', 'metrics/wau.md']);

describe('resolveLink', () => {
  it('resolves a sibling relative link', () => {
    const r = resolveLink('tables/orders.md', 'customers.md', KNOWN);
    expect(r).toEqual({ to: 'tables/customers.md', resolved: true, external: false });
  });

  it('resolves a parent-relative link and strips fragments', () => {
    const r = resolveLink('tables/orders.md', '../metrics/wau.md#section', KNOWN);
    expect(r).toEqual({ to: 'metrics/wau.md', resolved: true, external: false });
  });

  it('resolves a root-absolute (leading slash) link from bundle root', () => {
    const r = resolveLink('tables/orders.md', '/tables/customers.md', KNOWN);
    expect(r.to).toBe('tables/customers.md');
    expect(r.resolved).toBe(true);
  });

  it('marks http(s) links external and unresolved', () => {
    const r = resolveLink('tables/orders.md', 'https://example.com', KNOWN);
    expect(r).toEqual({ to: undefined, resolved: false, external: true });
  });

  it('marks an internal link to a missing file unresolved', () => {
    const r = resolveLink('tables/orders.md', 'ghost.md', KNOWN);
    expect(r).toEqual({ to: undefined, resolved: false, external: false });
  });
});

describe('extractLinks', () => {
  it('finds all Markdown links in the body', () => {
    const body = 'See [customers](customers.md) and [wau](../metrics/wau.md) and [ext](https://x.io).';
    const links = extractLinks('tables/orders.md', body, KNOWN);
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.toRaw)).toEqual(['customers.md', '../metrics/wau.md', 'https://x.io']);
    expect(links.filter((l) => l.resolved)).toHaveLength(2);
    expect(links.filter((l) => l.external)).toHaveLength(1);
  });
});
