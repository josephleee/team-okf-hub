// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeConfig, invalidateConfigCache, type OkfConfig } from '../../lib/config';
import { generateToken, hashToken } from '../../lib/secrets';

let cfgDir: string;
let bundleA: string;
let bundleB: string;
const tokenA = generateToken();
const tokenB = generateToken();
const origToken = process.env.OKF_INGEST_TOKEN;
const origBundle = process.env.OKF_BUNDLE_DIR;

const ctx = (ws: string) => ({ params: Promise.resolve({ ws }) });
const post = (ws: string, body: unknown, auth?: string) =>
  new Request(`http://t/w/${ws}/api/v1/work`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  cfgDir = mkdtempSync(join(tmpdir(), 'okf-wapi-cfg-'));
  bundleA = mkdtempSync(join(tmpdir(), 'okf-wapi-a-'));
  bundleB = mkdtempSync(join(tmpdir(), 'okf-wapi-b-'));
  writeFileSync(join(bundleA, 'a.md'), '---\ntype: index\ntitle: Alpha\n---\nalpha seed\n');
  writeFileSync(join(bundleB, 'b.md'), '---\ntype: index\ntitle: Beta\n---\nbeta seed\n');
  process.env.OKF_CONFIG_DIR = cfgDir;
  delete process.env.OKF_INGEST_TOKEN;
  delete process.env.OKF_BUNDLE_DIR;
  invalidateConfigCache();
  const cfg: OkfConfig = {
    version: 2, adminPasswordHash: 'scrypt$a$b', sessionSecret: 'c'.repeat(64),
    setupComplete: true, defaultWorkspace: 'a',
    workspaces: [
      { slug: 'a', name: 'A', bundle: { source: 'local', path: bundleA }, ingestTokenHash: hashToken(tokenA), createdAt: '2026-07-06T00:00:00Z' },
      { slug: 'b', name: 'B', bundle: { source: 'local', path: bundleB }, ingestTokenHash: hashToken(tokenB), createdAt: '2026-07-06T00:00:00Z' },
    ],
    createdAt: '2026-07-06T00:00:00Z',
  };
  writeConfig(cfg);
  const { resetService } = await import('../lib/service');
  resetService();
});
afterAll(async () => {
  const { resetService } = await import('../lib/service');
  resetService();
  rmSync(cfgDir, { recursive: true, force: true });
  rmSync(bundleA, { recursive: true, force: true });
  rmSync(bundleB, { recursive: true, force: true });
  delete process.env.OKF_CONFIG_DIR;
  if (origToken !== undefined) process.env.OKF_INGEST_TOKEN = origToken;
  if (origBundle !== undefined) process.env.OKF_BUNDLE_DIR = origBundle;
  invalidateConfigCache();
});

describe('/w/[ws]/api/v1/work', () => {
  it('404 for an unknown workspace', async () => {
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('nope', { title: 'x', summary: 'y', actor: 'z' }, `Bearer ${tokenA}`), ctx('nope'))).status).toBe(404);
  });
  it("201 with the workspace's own token; record lands in that workspace", async () => {
    const { POST, GET } = await import('./[ws]/api/v1/work/route');
    const res = await POST(post('b', { title: 'In B', summary: 's', actor: 'me', project: 'p' }, `Bearer ${tokenB}`), ctx('b'));
    expect(res.status).toBe(201);
    const list = await (await GET(new Request('http://t/w/b/api/v1/work?project=p'), ctx('b'))).json();
    expect(list.work.length).toBe(1);
    // and it is NOT in workspace a
    const listA = await (await GET(new Request('http://t/w/a/api/v1/work?project=p'), ctx('a'))).json();
    expect(listA.work.length).toBe(0);
  });
  it("401 with the OTHER workspace's token (isolation)", async () => {
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('a', { title: 'x', summary: 'y', actor: 'z' }, `Bearer ${tokenB}`), ctx('a'))).status).toBe(401);
  });
  it('env token works on any workspace (env wins)', async () => {
    process.env.OKF_INGEST_TOKEN = 'hubwide';
    const { POST } = await import('./[ws]/api/v1/work/route');
    expect((await POST(post('a', { title: 'Env', summary: 's', actor: 'me' }, 'Bearer hubwide'), ctx('a'))).status).toBe(201);
    delete process.env.OKF_INGEST_TOKEN;
  });
});

describe('/w/[ws]/api/v1 read routes', () => {
  it('search + concept are workspace-scoped', async () => {
    const search = (await import('./[ws]/api/v1/search/route')).GET;
    const bodyB = await (await search(new Request('http://t/w/b/api/v1/search?q=beta'), ctx('b'))).json();
    expect(bodyB.hits.length).toBeGreaterThan(0);
    const bodyA = await (await search(new Request('http://t/w/a/api/v1/search?q=beta'), ctx('a'))).json();
    expect(bodyA.hits.length).toBe(0);

    const concept = (await import('./[ws]/api/v1/concept/route')).GET;
    expect((await concept(new Request('http://t/w/a/api/v1/concept?path=a.md'), ctx('a'))).status).toBe(200);
    expect((await concept(new Request('http://t/w/b/api/v1/concept?path=a.md'), ctx('b'))).status).toBe(404);
  });
  it('graph 404s on an unknown workspace', async () => {
    const { GET } = await import('./[ws]/api/v1/graph/route');
    expect((await GET(new Request('http://t/w/nope/api/v1/graph?path=a.md'), ctx('nope'))).status).toBe(404);
  });
});
