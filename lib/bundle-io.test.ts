import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBundlePath, readConceptSource, writeConceptSource } from './bundle-io';

const dir = await mkdtemp(join(tmpdir(), 'okf-io-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('bundle-io', () => {
  it('writes then reads a concept source file', async () => {
    await writeConceptSource(dir, 'tables/orders.md', '---\ntype: Table\n---\nhi');
    expect(await readConceptSource(dir, 'tables/orders.md')).toContain('type: Table');
  });

  it('rejects path traversal outside the bundle', () => {
    expect(() => resolveBundlePath(dir, '../escape.md')).toThrow();
    expect(() => resolveBundlePath(dir, '/etc/passwd')).toThrow();
  });

  it('rejects non-markdown paths', () => {
    expect(() => resolveBundlePath(dir, 'tables/orders.txt')).toThrow();
  });
});
