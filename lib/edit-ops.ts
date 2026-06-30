import { parseConcept } from './okf-core/parse';
import { validateConcept } from './okf-core/validate';
import { extractLinks } from './okf-core/links';
import { renderMarkdown } from './okf-core/render';
import type { ValidationIssue } from './okf-core/types';
import { writeConceptSource } from './bundle-io';

export function validateContent(
  path: string,
  content: string,
  knownPaths: Set<string>,
): { issues: ValidationIssue[]; html: string } {
  const concept = parseConcept(path, content);
  const issues = validateConcept(concept);
  let html = '';
  if (!concept.parseError) {
    html = renderMarkdown(concept.body);
    for (const link of extractLinks(path, concept.body, knownPaths)) {
      if (!link.external && !link.resolved) {
        issues.push({ path, severity: 'warning', field: 'link', message: `Broken link: ${link.toRaw}` });
      }
    }
  }
  return { issues, html };
}

export async function saveContent(
  dir: string,
  path: string,
  content: string,
  knownPaths: Set<string>,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const { issues } = validateContent(path, content, knownPaths);
  if (issues.some((i) => i.severity === 'error')) {
    return { ok: false, issues };
  }
  await writeConceptSource(dir, path, content);
  return { ok: true, issues };
}
