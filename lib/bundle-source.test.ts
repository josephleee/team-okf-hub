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
