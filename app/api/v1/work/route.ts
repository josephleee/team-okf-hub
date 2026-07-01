import { recordWork, recentWork } from '../../../lib/work-api';
import { checkIngestAuth } from '../../../../lib/ingest-auth';
import type { WorkRecordInput } from '../../../../lib/work-record';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') ?? undefined;
  const actor = url.searchParams.get('actor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  const rows = await recentWork({ project, actor, limit: Number.isFinite(limit) ? limit : undefined });
  return Response.json({ work: rows });
}

export async function POST(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  let body: WorkRecordInput;
  try {
    body = (await req.json()) as WorkRecordInput;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const result = await recordWork(body);
  if (!result.ok) return Response.json({ error: 'validation failed', issues: result.issues }, { status: 422 });
  return Response.json({ ok: true, path: result.path }, { status: 201 });
}
