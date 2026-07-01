import { execFileSync } from 'node:child_process';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config';

export type SourceResult = { ok: true; path: string } | { ok: false; error: string };
export type ExecFn = (file: string, args: string[]) => void;

export function validateGitUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (!/^https:\/\/[^\s]+$/.test(url)) {
    return { ok: false, error: 'only https:// git URLs are allowed' };
  }
  if (/[;&|`$<>()\\'"]/.test(url)) {
    return { ok: false, error: 'URL contains disallowed characters' };
  }
  return { ok: true };
}

export function validateLocalPath(path: string): SourceResult {
  let st;
  try {
    st = statSync(path);
  } catch {
    return { ok: false, error: `path does not exist: ${path}` };
  }
  if (!st.isDirectory()) return { ok: false, error: 'path is not a directory' };
  const hasMd = readdirSync(path).some((n) => n.endsWith('.md'));
  if (!hasMd) return { ok: false, error: 'directory contains no .md files' };
  return { ok: true, path };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bundle';
}

export function cloneGitBundle(url: string, opts: { run?: ExecFn; destRoot?: string } = {}): SourceResult {
  const urlCheck = validateGitUrl(url);
  if (!urlCheck.ok) return urlCheck;
  const destRoot = opts.destRoot ?? join(configDir(), 'bundles');
  const name = slugify(url.replace(/\.git$/, '').split('/').pop() ?? 'bundle');
  const dest = join(destRoot, name);
  const run: ExecFn =
    opts.run ??
    ((file, args) => {
      execFileSync(file, args, { timeout: 60000, stdio: 'ignore' });
    });
  try {
    run('git', ['clone', '--depth', '1', url, dest]);
  } catch (err) {
    return { ok: false, error: `git clone failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return validateLocalPath(dest);
}
