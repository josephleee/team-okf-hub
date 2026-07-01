import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from '../../lib/work-api';
import { checkIngestAuth } from '../../../lib/ingest-auth';

export const runtime = 'nodejs';

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'okf_record_work',
      'Record a completed unit of work into the org memory as an OKF WorkRecord.',
      {
        title: z.string(),
        summary: z.string(),
        actor: z.string(),
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
        artifacts: z.array(z.string()).optional(),
        links: z.array(z.string()).optional(),
      },
      async (args) => {
        const r = await recordWork(args);
        return text(r.ok ? `recorded: ${r.path}` : `rejected: ${JSON.stringify(r.issues)}`);
      },
    );
    server.tool(
      'okf_recent_work',
      'List recent WorkRecords, optionally filtered by project or actor.',
      { project: z.string().optional(), actor: z.string().optional(), limit: z.number().optional() },
      async (args) => text(await recentWork(args)),
    );
    server.tool(
      'okf_search',
      'Full-text search across the org memory.',
      { query: z.string() },
      async ({ query }) => text(await searchMemory(query)),
    );
    server.tool(
      'okf_get',
      'Get the full content of one concept or WorkRecord by its bundle path.',
      { path: z.string() },
      async ({ path }) => {
        const c = await getConceptFull(path);
        return text(c ?? 'not found');
      },
    );
    server.tool(
      'okf_graph',
      'Get the graph neighborhood of a concept by path.',
      { path: z.string(), depth: z.number().optional() },
      async ({ path, depth }) => text(await graph(path, depth)),
    );
  },
  {},
  { basePath: '/api' },
);

async function authed(req: Request): Promise<Response> {
  const auth = checkIngestAuth(req.headers.get('authorization'));
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return handler(req);
}

export { authed as GET, authed as POST };
