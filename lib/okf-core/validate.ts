import type { Concept, ValidationIssue } from './types';

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isValidTimestamp(s: string): boolean {
  return ISO_8601.test(s) && !Number.isNaN(Date.parse(s));
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export function validateConcept(c: Concept): ValidationIssue[] {
  if (c.parseError) {
    return [{ path: c.path, severity: 'error', message: `Frontmatter parse error: ${c.parseError}` }];
  }

  const issues: ValidationIssue[] = [];

  if (!c.type) {
    issues.push({ path: c.path, severity: 'error', field: 'type', message: '`type` is required' });
  }

  if (c.frontmatter.tags !== undefined && !Array.isArray(c.frontmatter.tags)) {
    issues.push({ path: c.path, severity: 'error', field: 'tags', message: '`tags` must be a list' });
  }

  if (c.timestamp !== undefined && !isValidTimestamp(c.timestamp)) {
    issues.push({ path: c.path, severity: 'warning', field: 'timestamp', message: '`timestamp` should be ISO-8601' });
  }

  if (c.resource !== undefined && !isValidUrl(c.resource)) {
    issues.push({ path: c.path, severity: 'warning', field: 'resource', message: '`resource` should be a valid URL' });
  }

  return issues;
}
