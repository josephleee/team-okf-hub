import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-workapi-'));
  writeFileSync(join(dir, 'index.md'), '---\ntype: index\ntitle: Home\n---\nseed\n');
  process.env.OKF_BUNDLE_DIR = dir;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_BUNDLE_DIR;
});

describe('work-api', () => {
  it('records a WorkRecord to disk and makes it queryable', async () => {
    const { recordWork, recentWork } = await import('./work-api');
    const res = await recordWork({
      title: 'Wire ingestion', summary: 'Added the endpoint.', actor: 'jungsup',
      project: 'team-okf-hub', timestamp: '2026-07-01T12:00:00Z', tags: ['feature'],
    });
    expect(res.ok).toBe(true);
    expect(res.path).toBe('work/team-okf-hub/2026-07-01-120000-wire-ingestion.md');
    const file = join(dir, res.path);
    expect(existsSync(file)).toBe(true);

    const rows = await recentWork();
    expect(rows.some((r) => r.path === res.path && r.actor === 'jungsup')).toBe(true);
  });

  it('rejects input missing required fields without writing', async () => {
    const { recordWork } = await import('./work-api');
    const res = await recordWork({ title: '', summary: '', actor: '' } as never);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(res.path).toBe('');
  });
});
