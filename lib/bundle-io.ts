import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';

export function resolveBundlePath(dir: string, path: string): string {
  const base = resolve(dir);
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new Error(`path escapes the bundle: ${path}`);
  }
  if (!full.endsWith('.md')) {
    throw new Error(`not a markdown file: ${path}`);
  }
  return full;
}

export async function readConceptSource(dir: string, path: string): Promise<string> {
  return readFile(resolveBundlePath(dir, path), 'utf8');
}

export async function writeConceptSource(dir: string, path: string, content: string): Promise<void> {
  const full = resolveBundlePath(dir, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}
