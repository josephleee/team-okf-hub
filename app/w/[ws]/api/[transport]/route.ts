import { mcpHandlerFor } from '../../../../lib/mcp';
import { requireWorkspace } from '../../../../lib/api-handlers';
import { checkIngestAuth } from '../../../../../lib/ingest-auth';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ ws: string; transport: string }> };

async function authed(req: Request, ctx: Ctx): Promise<Response> {
  const { ws } = await ctx.params;
  const missing = requireWorkspace(ws);
  if (missing) return missing;
  const auth = checkIngestAuth(req.headers.get('authorization'), ws);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return mcpHandlerFor(ws, `/w/${ws}/api`)(req);
}

export { authed as GET, authed as POST, authed as DELETE };
