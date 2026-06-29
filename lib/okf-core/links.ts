import { posix } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { Link } from './types';

const parser = unified().use(remarkParse).use(remarkGfm);

function normalizeTarget(fromPath: string, toRel: string): string {
  if (toRel.startsWith('/')) {
    return posix.normalize(toRel.replace(/^\/+/, ''));
  }
  const dir = posix.dirname(fromPath);
  return posix.normalize(posix.join(dir, toRel)).replace(/^(\.\/)+/, '');
}

export function resolveLink(fromPath: string, toRaw: string, knownPaths: Set<string>) {
  // Anything with a URI scheme (http:, mailto:, etc.) or protocol-relative is external.
  if (/^[a-z][a-z0-9+.-]*:/i.test(toRaw) || toRaw.startsWith('//')) {
    return { to: undefined, resolved: false, external: true };
  }
  const clean = toRaw.split('#')[0]!.split('?')[0]!;
  if (!clean) {
    return { to: undefined, resolved: false, external: false }; // pure anchor / empty
  }
  const target = normalizeTarget(fromPath, clean);
  const resolved = knownPaths.has(target);
  return { to: resolved ? target : undefined, resolved, external: false };
}

export function extractLinks(fromPath: string, body: string, knownPaths: Set<string> = new Set()): Link[] {
  const tree = parser.parse(body) as Root;
  const links: Link[] = [];
  visit(tree, 'link', (node) => {
    const r = resolveLink(fromPath, node.url, knownPaths);
    links.push({ from: fromPath, toRaw: node.url, to: r.to, resolved: r.resolved, external: r.external });
  });
  return links;
}
