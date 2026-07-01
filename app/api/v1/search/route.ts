import { searchMemory } from '../../../lib/work-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const hits = await searchMemory(q);
  return Response.json({ query: q, hits });
}
