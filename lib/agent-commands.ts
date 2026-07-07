export interface AgentCommands {
  mcpAdd: string;
  curlRecord: string;
  curlSearch: string;
}

const TOKEN_PLACEHOLDER = '<TOKEN>';

// The single source of every agent command shown in the UI. `slug: null`
// targets the legacy default-workspace URLs; omit `token` to embed <TOKEN>.
export function buildAgentCommands(origin: string, slug: string | null, token?: string): AgentCommands {
  const t = token ?? TOKEN_PLACEHOLDER;
  const base = slug ? `${origin}/w/${slug}` : origin;
  const name = slug ? `okf-${slug}` : 'okf-hub';
  return {
    mcpAdd: `claude mcp add --transport http ${name} ${base}/api/mcp --header "Authorization: Bearer ${t}"`,
    curlRecord: `curl -X POST ${base}/api/v1/work -H "Authorization: Bearer ${t}" -H 'content-type: application/json' -d '{"title":"hello","summary":"first record","actor":"me"}'`,
    curlSearch: `curl '${base}/api/v1/search?q=hello'`,
  };
}
