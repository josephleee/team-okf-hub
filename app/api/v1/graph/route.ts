import { graph } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const depthRaw = url.searchParams.get('depth');
  const depth = depthRaw !== null ? Number(depthRaw) : undefined;
  const data = await graph(path, Number.isFinite(depth) ? depth : undefined);
  return Response.json({ graph: data });
}
