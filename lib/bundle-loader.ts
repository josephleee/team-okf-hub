import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { RawFile } from './okf-core/types';

export async function readBundleFromDir(dir: string): Promise<RawFile[]> {
  const files: RawFile[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(full, 'utf8');
        files.push({ path: relative(dir, full).split(sep).join('/'), content });
      }
    }
  }

  await walk(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
