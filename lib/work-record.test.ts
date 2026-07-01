import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { slugify, buildWorkRecordSource } from './work-record';

describe('slugify', () => {
  it('lowercases, replaces non-alnum with dashes, trims', () => {
    expect(slugify('Add rehype-sanitize to render!')).toBe('add-rehype-sanitize-to-render');
  });
  it('collapses repeats and caps length at 60', () => {
    expect(slugify('a'.repeat(80)).length).toBe(60);
    expect(slugify('  --Hello   World--  ')).toBe('hello-world');
  });
});

describe('buildWorkRecordSource', () => {
  const base = { title: 'Add sanitize', summary: 'Hardened render.', actor: 'jungsup' };
  const now = '2026-07-01T14:23:05Z';

  it('computes a path from project, date, time, and slug', () => {
    const { path } = buildWorkRecordSource({ ...base, project: 'team-okf-hub' }, now);
    expect(path).toBe('work/team-okf-hub/2026-07-01-142305-add-sanitize.md');
  });

  it('defaults project to general and uses now when timestamp absent', () => {
    const { path, content } = buildWorkRecordSource(base, now);
    expect(path).toBe('work/general/2026-07-01-142305-add-sanitize.md');
    expect(matter(content).data.timestamp).toBe(now);
  });

  it('emits valid OKF frontmatter (type + list fields)', () => {
    const { content } = buildWorkRecordSource(
      { ...base, tags: ['security'], artifacts: ['https://x/pr/1'] },
      now,
    );
    const { data, content: body } = matter(content);
    expect(data.type).toBe('WorkRecord');
    expect(data.title).toBe('Add sanitize');
    expect(data.actor).toBe('jungsup');
    expect(data.project).toBe('general');
    expect(data.tags).toEqual(['security']);
    expect(data.artifacts).toEqual(['https://x/pr/1']);
    expect(body.trim()).toBe('Hardened render.');
  });

  it('appends a Related section for links', () => {
    const { content } = buildWorkRecordSource({ ...base, links: ['tables/orders.md'] }, now);
    expect(content).toContain('## Related');
    expect(content).toContain('- [tables/orders.md](tables/orders.md)');
  });

  it('defaults tags and artifacts to empty arrays', () => {
    const { content } = buildWorkRecordSource(base, now);
    const { data } = matter(content);
    expect(data.tags).toEqual([]);
    expect(data.artifacts).toEqual([]);
  });

  it('falls back to now for a hostile timestamp (path traversal attempt)', () => {
    const { path, content } = buildWorkRecordSource(
      { ...base, timestamp: '../../../../etc/passwd' },
      now,
    );
    expect(path.startsWith('work/general/')).toBe(true);
    expect(path.includes('..')).toBe(false);
    expect(matter(content).data.timestamp).toBe(now);
  });

  it('falls back to now for a timestamp with embedded slashes', () => {
    const { path, content } = buildWorkRecordSource(
      { ...base, timestamp: '2026-07-01/x/y' },
      now,
    );
    expect(path.startsWith('work/general/')).toBe(true);
    expect(path.includes('..')).toBe(false);
    expect(matter(content).data.timestamp).toBe(now);
  });

  it('preserves a valid ISO timestamp unchanged', () => {
    const validTs = '2025-12-31T23:59:59Z';
    const { path, content } = buildWorkRecordSource(
      { ...base, timestamp: validTs },
      now,
    );
    expect(path).toBe('work/general/2025-12-31-235959-add-sanitize.md');
    expect(matter(content).data.timestamp).toBe(validTs);
  });
});
