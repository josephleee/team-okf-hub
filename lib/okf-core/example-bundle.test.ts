import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { buildBundle } from './bundle';
import type { RawFile } from './types';

const ROOT = join(process.cwd(), 'bundles/example');

function readMd(dir: string): RawFile[] {
  const out: RawFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readMd(full));
    else if (name.endsWith('.md')) {
      out.push({ path: relative(ROOT, full).split(sep).join('/'), content: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

describe('example bundle', () => {
  const bundle = buildBundle(readMd(ROOT));

  it('has five concepts, each with a type', () => {
    expect(bundle.concepts).toHaveLength(5);
    expect(bundle.concepts.every((c) => c.type.length > 0)).toBe(true);
  });

  it('has no error-severity issues and no broken links', () => {
    expect(bundle.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(bundle.issues.filter((i) => i.field === 'link')).toEqual([]);
  });

  it('has every internal link resolved', () => {
    const internal = bundle.links.filter((l) => !l.external);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((l) => l.resolved)).toBe(true);
  });
});
