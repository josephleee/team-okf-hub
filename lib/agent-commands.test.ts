import { describe, it, expect } from 'vitest';
import { buildAgentCommands } from './agent-commands';

describe('buildAgentCommands', () => {
  it('builds workspace commands with origin, slug, and token', () => {
    const c = buildAgentCommands('https://hub.example.com', 'labs', 'SECRET42');
    expect(c.mcpAdd).toBe(
      'claude mcp add --transport http okf-labs https://hub.example.com/w/labs/api/mcp --header "Authorization: Bearer SECRET42"',
    );
    expect(c.curlRecord).toContain('https://hub.example.com/w/labs/api/v1/work');
    expect(c.curlRecord).toContain('Bearer SECRET42');
    expect(c.curlSearch).toBe("curl 'https://hub.example.com/w/labs/api/v1/search?q=hello'");
  });

  it('uses the <TOKEN> placeholder when no token is given', () => {
    const c = buildAgentCommands('http://localhost:3000', 'labs');
    expect(c.mcpAdd).toContain('Bearer <TOKEN>');
    expect(c.curlRecord).toContain('Bearer <TOKEN>');
  });

  it('slug null targets the legacy default-workspace URLs', () => {
    const c = buildAgentCommands('http://localhost:3000', null, 'T');
    expect(c.mcpAdd).toContain('okf-hub http://localhost:3000/api/mcp');
    expect(c.curlRecord).toContain('http://localhost:3000/api/v1/work');
    expect(c.curlSearch).toContain('http://localhost:3000/api/v1/search?q=hello');
  });

  it('commands are single-line (copy-paste safe)', () => {
    const c = buildAgentCommands('http://localhost:3000', 'x', 't');
    for (const cmd of [c.mcpAdd, c.curlRecord, c.curlSearch]) expect(cmd).not.toMatch(/\n/);
  });
});
