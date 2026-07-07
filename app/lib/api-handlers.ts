import 'server-only';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from './work-api';
import { checkIngestAuth } from '../../lib/ingest-auth';
import { getWorkspace } from '../../lib/config';
import type { WorkRecordInput } from '../../lib/work-record';

export function requireWorkspace(slug: string): Response | null {
  if (getWorkspace(slug)) return null;
  return Response.json({ error: 'unknown workspace' }, { status: 404 });
}

export async function handleWorkGET(req: Request, slug?: string): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  const rows = await recentWork({ project, actor, limit: Number.isFinite(limit) ? limit : undefined }, slug);
  return Response.json({ work: rows });
}

export async function handleWorkPOST(req: Request, slug?: string): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'), slug);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  let body: WorkRecordInput;
  try {
    body = (await req.json()) as WorkRecordInput;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const result = await recordWork(body, slug);
  if (!result.ok) return Response.json({ error: 'validation failed', issues: result.issues }, { status: 422 });
  return Response.json({ ok: true, path: result.path }, { status: 201 });
}

export async function handleSearchGET(req: Request, slug?: string): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const hits = await searchMemory(q, slug);
  return Response.json({ query: q, hits });
}

export async function handleConceptGET(req: Request, slug?: string): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const concept = await getConceptFull(path, slug);
  if (!concept) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ concept });
}

export async function handleGraphGET(req: Request, slug?: string): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const depthRaw = url.searchParams.get('depth');
  const depth = depthRaw !== null ? Number(depthRaw) : undefined;
  const data = await graph(path, Number.isFinite(depth) ? depth : undefined, slug);
  return Response.json({ graph: data });
}
