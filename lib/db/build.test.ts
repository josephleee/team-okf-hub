import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildBundle } from '../okf-core/bundle';
import type { RawFile } from '../okf-core/types';
import { buildIndex } from './build';

const FILES: RawFile[] = [
  { path: 'tables/orders.md', content: '---\ntype: Table\ntitle: Orders\ntags: [sales]\n---\nBody [c](customers.md).' },
  { path: 'tables/customers.md', content: '---\ntype: Table\ntitle: Customers\n---\n# Customers\nText.' },
];

function freshDb() {
  const db = new Database(':memory:');
  buildIndex(db, buildBundle(FILES));
  return db;
}

describe('buildIndex', () => {
  it('inserts one row per concept with rendered HTML', () => {
    const db = freshDb();
    const row = db.prepare('SELECT * FROM concepts WHERE path = ?').get('tables/customers.md') as any;
    expect(row.type).toBe('Table');
    expect(row.title).toBe('Customers');
    expect(JSON.parse(row.frontmatter_json).title).toBe('Customers');
    expect(row.body_html).toContain('<h1>Customers</h1>');
  });

  it('inserts tags and links', () => {
    const db = freshDb();
    const tag = db.prepare('SELECT tag FROM tags WHERE concept_path = ?').get('tables/orders.md') as any;
    expect(tag.tag).toBe('sales');
    const link = db.prepare('SELECT * FROM links WHERE src_path = ?').get('tables/orders.md') as any;
    expect(link.dst_path).toBe('tables/customers.md');
    expect(link.resolved).toBe(1);
  });

  it('populates the FTS index so MATCH works', () => {
    const db = freshDb();
    const hit = db.prepare("SELECT path FROM concepts_fts WHERE concepts_fts MATCH 'orders'").get() as any;
    expect(hit.path).toBe('tables/orders.md');
  });
});
