import { execFileSync } from 'node:child_process';
import { statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config';

export type SourceResult = { ok: true; path: string } | { ok: false; error: string };
export type ExecFn = (file: string, args: string[]) => void;

// Blocks loopback / link-local / private / this-host literals so a git clone
// cannot be pointed at internal infrastructure (SSRF). This is a literal-address
// denylist, not a resolve-time guard, so DNS names that resolve to private ranges
// are not caught here — it stops the naive, direct-IP cases.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, private
    if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    return false;
  }
  if (h === '::' || h === '::1') return true; // unspecified, loopback
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local fc00::/7
  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedHost(mapped[1]!);
  return false;
}

export function validateGitUrl(url: string): { ok: true } | { ok: false; error: string } {
  if (!/^https:\/\/[^\s]+$/.test(url)) {
    return { ok: false, error: 'only https:// git URLs are allowed' };
  }
  if (/[;&|`$<>()\\'"]/.test(url)) {
    return { ok: false, error: 'URL contains disallowed characters' };
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, error: 'URL is not parseable' };
  }
  if (!host || isBlockedHost(host)) {
    return { ok: false, error: 'URL host is not allowed (loopback, link-local, or private address)' };
  }
  return { ok: true };
}

export function validateLocalPath(path: string): SourceResult {
  let st;
  try {
    st = statSync(path);
  } catch {
    return { ok: false, error: `path does not exist: ${path} — use an absolute path on the server (~ is not expanded)` };
  }
  if (!st.isDirectory()) return { ok: false, error: 'path is not a directory' };
  const hasMd = readdirSync(path).some((n) => n.endsWith('.md'));
  if (!hasMd) return { ok: false, error: 'directory contains no .md files — add at least one .md at the top level' };
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
