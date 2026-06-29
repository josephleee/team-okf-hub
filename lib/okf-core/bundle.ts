import { parseConcept } from './parse';
import { validateConcept } from './validate';
import { extractLinks } from './links';
import type { RawFile, Bundle, Concept, Link, ValidationIssue } from './types';

export function buildBundle(files: RawFile[]): Bundle {
  const concepts: Concept[] = files.map((f) => parseConcept(f.path, f.content));
  const knownPaths = new Set(concepts.map((c) => c.path));
  const links: Link[] = [];
  const issues: ValidationIssue[] = [];

  for (const c of concepts) {
    issues.push(...validateConcept(c));

    if (c.parseError) continue; // don't try to read links from an unparseable doc

    const conceptLinks = extractLinks(c.path, c.body, knownPaths);
    links.push(...conceptLinks);

    for (const l of conceptLinks) {
      if (!l.external && !l.resolved) {
        issues.push({
          path: c.path,
          severity: 'warning',
          field: 'link',
          message: `Broken link: ${l.toRaw}`,
        });
      }
    }
  }

  return { concepts, links, issues };
}
