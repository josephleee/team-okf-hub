import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { recordWork, recentWork, searchMemory, getConceptFull, graph } from './work-api';

type McpHandler = (req: Request) => Promise<Response>;

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

// createMcpHandler's basePath is static per instance, so each mount gets its own
// handler, memoized on globalThis (mirrors the service registry pattern).
const cache = globalThis as unknown as { __okfMcpHandlers?: Map<string, McpHandler> };

export function mcpHandlerFor(slug: string | undefined, basePath: string): McpHandler {
  if (!cache.__okfMcpHandlers) cache.__okfMcpHandlers = new Map();
  const map = cache.__okfMcpHandlers;
  let handler = map.get(basePath);
  if (!handler) {
    handler = createMcpHandler(
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
            const r = await recordWork(args, slug);
            return text(r.ok ? `recorded: ${r.path}` : `rejected: ${JSON.stringify(r.issues)}`);
          },
        );
        server.tool(
          'okf_recent_work',
          'List recent WorkRecords, optionally filtered by project or actor.',
          { project: z.string().optional(), actor: z.string().optional(), limit: z.number().optional() },
          async (args) => text(await recentWork(args, slug)),
        );
        server.tool(
          'okf_search',
          'Full-text search across the org memory.',
          { query: z.string() },
          async ({ query }) => text(await searchMemory(query, slug)),
        );
        server.tool(
          'okf_get',
          'Get the full content of one concept or WorkRecord by its bundle path.',
          { path: z.string() },
          async ({ path }) => {
            const c = await getConceptFull(path, slug);
            return text(c ?? 'not found');
          },
        );
        server.tool(
          'okf_graph',
          'Get the graph neighborhood of a concept by path.',
          { path: z.string(), depth: z.number().optional() },
          async ({ path, depth }) => text(await graph(path, depth, slug)),
        );
      },
      {},
      { basePath },
    );
    map.set(basePath, handler);
  }
  return handler;
}
