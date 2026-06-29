import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readBundleFromDir } from './bundle-loader';

const EXAMPLE = join(process.cwd(), 'bundles/example');

describe('readBundleFromDir', () => {
  it('reads all markdown files recursively with POSIX relative paths', async () => {
    const files = await readBundleFromDir(EXAMPLE);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('index.md');
    expect(paths).toContain('tables/orders.md');
    expect(paths).toContain('metrics/weekly_active_users.md');
    expect(paths.every((p) => !p.includes('\\'))).toBe(true);
  });

  it('returns files sorted by path with their content', async () => {
    const files = await readBundleFromDir(EXAMPLE);
    const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
    expect(files).toEqual(sorted);
    const orders = files.find((f) => f.path === 'tables/orders.md');
    expect(orders?.content).toContain('type: BigQuery Table');
  });
});
