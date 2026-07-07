import { requireWorkspace, handleGraphGET } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ ws: string }> }): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleGraphGET(req, ws);
}
