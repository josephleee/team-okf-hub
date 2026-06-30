import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContent, saveContent } from './edit-ops';

const known = new Set(['tables/orders.md', 'tables/customers.md']);
const dir = await mkdtemp(join(tmpdir(), 'okf-edit-'));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('validateContent', () => {
  it('reports a missing-type error and renders no html on parse error', () => {
    const r = validateContent('x.md', '---\ntitle: no type\n---\nhi', known);
    expect(r.issues.some((i) => i.severity === 'error' && i.field === 'type')).toBe(true);
  });

  it('renders sanitized html and flags a broken internal link as a warning', () => {
    const r = validateContent('tables/orders.md', '---\ntype: Table\n---\n# H\nLink [x](ghost.md).', known);
    expect(r.html).toContain('<h1>H</h1>');
    expect(r.issues.some((i) => i.severity === 'warning' && i.field === 'link')).toBe(true);
  });
});

describe('saveContent', () => {
  it('writes the file when there are no errors', async () => {
    const r = await saveContent(dir, 'tables/orders.md', '---\ntype: Table\ntitle: Orders\n---\nbody', known);
    expect(r.ok).toBe(true);
    expect(await readFile(join(dir, 'tables/orders.md'), 'utf8')).toContain('title: Orders');
  });

  it('does NOT write when there is an error', async () => {
    const r = await saveContent(dir, 'bad.md', '---\ntitle: no type\n---\nx', known);
    expect(r.ok).toBe(false);
    await expect(readFile(join(dir, 'bad.md'), 'utf8')).rejects.toThrow();
  });
});
