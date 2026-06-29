import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runValidate, runQuery } from './okf';

const EXAMPLE = join(process.cwd(), 'bundles/example');

async function tmpBundle(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'okf-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return dir;
}

describe('okf CLI', () => {
  it('validate exits 0 on the clean example bundle', async () => {
    const lines: string[] = [];
    const code = await runValidate(EXAMPLE, (s) => lines.push(s));
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/ok|0 error/i);
  });

  it('validate exits 1 when a concept is missing its type', async () => {
    const dir = await tmpBundle({ 'a.md': '---\ntitle: no type\n---\nbody' });
    const code = await runValidate(dir, () => {});
    expect(code).toBe(1);
  });

  it('query prints matching concept paths', async () => {
    const lines: string[] = [];
    const code = await runQuery(EXAMPLE, 'orders', (s) => lines.push(s));
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('tables/orders.md');
  });
});
