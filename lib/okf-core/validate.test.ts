import { describe, it, expect } from 'vitest';
import { parseConcept } from './parse';
import { validateConcept } from './validate';

function issuesFor(doc: string) {
  return validateConcept(parseConcept('x.md', doc));
}

describe('validateConcept', () => {
  it('passes a valid concept with no issues', () => {
    const issues = issuesFor('---\ntype: Note\ntimestamp: 2026-01-01T00:00:00Z\nresource: https://a.b\n---\nhi');
    expect(issues).toEqual([]);
  });

  it('errors when type is missing', () => {
    const issues = issuesFor('---\ntitle: No Type\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', field: 'type' }),
    );
  });

  it('errors when tags is not a list', () => {
    const issues = issuesFor('---\ntype: Note\ntags: oops\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', field: 'tags' }),
    );
  });

  it('warns on a non-ISO timestamp', () => {
    const issues = issuesFor('---\ntype: Note\ntimestamp: "not-a-date"\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', field: 'timestamp' }),
    );
  });

  it('warns on an invalid resource URL', () => {
    const issues = issuesFor('---\ntype: Note\nresource: "not a url"\n---\nhi');
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', field: 'resource' }),
    );
  });

  it('reports a single error for a parse failure and stops', () => {
    const issues = issuesFor('---\ntype: [unclosed\n---\nhi');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
  });
});
