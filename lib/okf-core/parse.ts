import matter from 'gray-matter';
import type { Concept } from './types';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function parseConcept(path: string, content: string): Concept {
  let data: Record<string, unknown> = {};
  let body = content;
  let parseError: string | undefined;

  try {
    const parsed = matter(content);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  const rawTs = data.timestamp;
  const timestamp =
    typeof rawTs === 'string' ? rawTs : rawTs instanceof Date ? rawTs.toISOString() : undefined;

  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    path,
    type: asString(data.type) ?? '',
    title: asString(data.title),
    description: asString(data.description),
    resource: asString(data.resource),
    tags,
    timestamp,
    frontmatter: data,
    body,
    parseError,
  };
}
