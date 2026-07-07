import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateGitUrl, validateLocalPath, cloneGitBundle } from './bundle-source';

describe('validateGitUrl', () => {
  it('accepts https git URLs', () => {
    expect(validateGitUrl('https://github.com/org/repo.git').ok).toBe(true);
  });
  it('rejects non-https and injection attempts', () => {
    expect(validateGitUrl('ssh://git@github.com/o/r.git').ok).toBe(false);
    expect(validateGitUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateGitUrl('git://x/y').ok).toBe(false);
    expect(validateGitUrl('https://x/y ; rm -rf /').ok).toBe(false);
    expect(validateGitUrl('https://x/$(whoami)').ok).toBe(false);
    expect(validateGitUrl('').ok).toBe(false);
  });
  it('rejects private, loopback, and link-local hosts (SSRF)', () => {
    expect(validateGitUrl('https://localhost/x.git').ok).toBe(false);
    expect(validateGitUrl('https://127.0.0.1/x.git').ok).toBe(false);
    expect(validateGitUrl('https://169.254.169.254/latest/').ok).toBe(false); // cloud metadata
    expect(validateGitUrl('https://10.0.0.5/x.git').ok).toBe(false);
    expect(validateGitUrl('https://192.168.1.1/x.git').ok).toBe(false);
    expect(validateGitUrl('https://172.16.0.1/x.git').ok).toBe(false);
    expect(validateGitUrl('https://[::1]/x.git').ok).toBe(false);
    expect(validateGitUrl('https://user:pass@10.0.0.5/x.git').ok).toBe(false); // creds don't bypass host check
  });
  it('still accepts ordinary public hosts', () => {
    expect(validateGitUrl('https://gitlab.com/org/repo.git').ok).toBe(true);
    expect(validateGitUrl('https://github.com/org/repo.git').ok).toBe(true);
  });
});

describe('validateLocalPath', () => {
  it('accepts a dir with a .md file', () => {
    const d = mkdtempSync(join(tmpdir(), 'okf-lp-'));
    writeFileSync(join(d, 'a.md'), '---\ntype: index\n---\nx');
    expect(validateLocalPath(d)).toEqual({ ok: true, path: d });
    rmSync(d, { recursive: true, force: true });
  });
  it('rejects missing, non-dir, and empty dirs', () => {
    expect(validateLocalPath('/no/such/path').ok).toBe(false);
    const d = mkdtempSync(join(tmpdir(), 'okf-lp2-'));
    expect(validateLocalPath(d).ok).toBe(false); // no .md
    rmSync(d, { recursive: true, force: true });
  });
  it('error messages teach the fix', () => {
    const missing = validateLocalPath('/no/such/path');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('~ is not expanded');
    const d = mkdtempSync(join(tmpdir(), 'okf-lp3-'));
    const empty = validateLocalPath(d);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('top level');
    rmSync(d, { recursive: true, force: true });
  });
});

describe('cloneGitBundle', () => {
  it('runs git via an argument array (no shell) and validates the clone', () => {
    const root = mkdtempSync(join(tmpdir(), 'okf-clone-'));
    const calls: { file: string; args: string[] }[] = [];
    const run = (file: string, args: string[]) => {
      calls.push({ file, args });
      const dest = args[args.length - 1]!;      // git clone ... <dest>
      mkdirSync(dest, { recursive: true });
      writeFileSync(join(dest, 'index.md'), '---\ntype: index\n---\ncloned');
    };
    const res = cloneGitBundle('https://github.com/org/repo.git', { run, destRoot: root });
    expect(res.ok).toBe(true);
    expect(calls[0]!.file).toBe('git');
    expect(calls[0]!.args.slice(0, 3)).toEqual(['clone', '--depth', '1']);
    expect(calls[0]!.args).toContain('https://github.com/org/repo.git');
    rmSync(root, { recursive: true, force: true });
  });
  it('rejects a bad url before running git', () => {
    let ran = false;
    const res = cloneGitBundle('file:///etc', { run: () => { ran = true; } });
    expect(res.ok).toBe(false);
    expect(ran).toBe(false);
  });
});
