import { requireWorkspace, handleWorkGET, handleWorkPOST } from '../../../../../lib/api-handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ws: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleWorkGET(req, ws);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  return requireWorkspace(ws) ?? handleWorkPOST(req, ws);
}
