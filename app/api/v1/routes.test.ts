// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let dir: string;
const origToken = process.env.OKF_INGEST_TOKEN;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'okf-routes-'));
  writeFileSync(join(dir, 'index.md'), '---\ntype: index\ntitle: Home\n---\nseed\n');
  process.env.OKF_BUNDLE_DIR = dir;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OKF_BUNDLE_DIR;
  if (origToken === undefined) delete process.env.OKF_INGEST_TOKEN;
  else process.env.OKF_INGEST_TOKEN = origToken;
});

const post = (body: unknown, auth?: string) =>
  new Request('http://t/api/v1/work', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/v1/work auth + validation', () => {
  it('503 when OKF_INGEST_TOKEN is unset', async () => {
    delete process.env.OKF_INGEST_TOKEN;
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: 'x', summary: 'y', actor: 'z' }, 'Bearer x'))).status).toBe(503);
  });
  it('401 with a wrong token', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: 'x', summary: 'y', actor: 'z' }, 'Bearer nope'))).status).toBe(401);
  });
  it('400 on invalid JSON', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post('{not json', 'Bearer tok'))).status).toBe(400);
  });
  it('422 when required fields are missing', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST } = await import('./work/route');
    expect((await POST(post({ title: '' }, 'Bearer tok'))).status).toBe(422);
  });
  it('201 with a valid token and body, and GET lists it', async () => {
    process.env.OKF_INGEST_TOKEN = 'tok';
    const { POST, GET } = await import('./work/route');
    const res = await POST(post({ title: 'Ship it', summary: 'done', actor: 'jungsup', project: 'p' }, 'Bearer tok'));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.path).toContain('work/p/');

    const list = await (await GET(new Request('http://t/api/v1/work?project=p'))).json();
    expect(list.work.some((w: { path: string }) => w.path === created.path)).toBe(true);
  });
});

describe('GET /api/v1/search + /concept', () => {
  it('search returns hits shape', async () => {
    const { GET } = await import('./search/route');
    const body = await (await GET(new Request('http://t/api/v1/search?q=seed'))).json();
    expect(body.query).toBe('seed');
    expect(Array.isArray(body.hits)).toBe(true);
  });
  it('concept 400 without path, 404 for unknown', async () => {
    const { GET } = await import('./concept/route');
    expect((await GET(new Request('http://t/api/v1/concept'))).status).toBe(400);
    expect((await GET(new Request('http://t/api/v1/concept?path=nope.md'))).status).toBe(404);
  });
});
