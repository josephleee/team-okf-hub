import { describe, it, expect } from 'vitest';
import { parseConcept } from './parse';

const DOC = `---
type: BigQuery Table
title: Orders
description: One row per completed order.
resource: https://console.cloud.google.com/bigquery
tags: [sales, revenue]
timestamp: 2026-05-28T14:30:00Z
---

# Schema
Body text here.
`;

describe('parseConcept', () => {
  it('extracts the required type and optional fields', () => {
    const c = parseConcept('tables/orders.md', DOC);
    expect(c.path).toBe('tables/orders.md');
    expect(c.type).toBe('BigQuery Table');
    expect(c.title).toBe('Orders');
    expect(c.description).toBe('One row per completed order.');
    expect(c.resource).toBe('https://console.cloud.google.com/bigquery');
    expect(c.tags).toEqual(['sales', 'revenue']);
    expect(c.timestamp).toBe('2026-05-28T14:30:00.000Z');
    expect(c.body).toContain('# Schema');
    expect(c.parseError).toBeUndefined();
  });

  it('defaults tags to [] and leaves missing fields undefined', () => {
    const c = parseConcept('x.md', '---\ntype: Note\n---\nhi');
    expect(c.tags).toEqual([]);
    expect(c.title).toBeUndefined();
    expect(c.type).toBe('Note');
  });

  it('records a parseError instead of throwing on malformed YAML', () => {
    const c = parseConcept('bad.md', '---\ntype: [unclosed\n---\nbody');
    expect(c.parseError).toBeTruthy();
    expect(c.body).toBeDefined();
  });

  it('treats a document with no frontmatter as having empty type', () => {
    const c = parseConcept('plain.md', 'just text');
    expect(c.type).toBe('');
    expect(c.body).toBe('just text');
  });
});
