import { mcpHandlerFor } from '../../lib/mcp';
import { checkIngestAuth } from '../../../lib/ingest-auth';

export const runtime = 'nodejs';

async function authed(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return mcpHandlerFor(undefined, '/api')(req);
}

export { authed as GET, authed as POST, authed as DELETE };
