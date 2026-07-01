import { getConceptFull } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path');
  if (!path) return Response.json({ error: 'missing path' }, { status: 400 });
  const concept = await getConceptFull(path);
  if (!concept) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ concept });
}
