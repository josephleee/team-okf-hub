'use client';
import { useEffect, useState } from 'react';
import { buildAgentCommands } from '../../lib/agent-commands';
import { CopyButton } from './copy-button';

// "Verify it now" block shown wherever a token is issued. Builds commands from
// the real origin, so they are correct on any host — rendered after mount to
// avoid an SSR/hydration mismatch on window.location.
export function AgentSnippets({ slug, token }: { slug: string; token: string }) {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  if (!origin) return null;
  const cmd = buildAgentCommands(origin, slug, token);
  return (
    <div className="okf-snippets">
      <h3>1 · Connect an agent</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.mcpAdd}</code></pre><CopyButton text={cmd.mcpAdd} /></div>
      <p className="okf-setup__hint">Run where Claude Code is installed.</p>

      <h3>2 · Test a write</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.curlRecord}</code></pre><CopyButton text={cmd.curlRecord} /></div>
      <p className="okf-setup__hint">Expect HTTP 201 — then see it on the <a href="/work">Work timeline</a>.</p>

      <h3>3 · Test a read</h3>
      <div className="okf-setup__copyrow"><pre><code>{cmd.curlSearch}</code></pre><CopyButton text={cmd.curlSearch} /></div>
      <p className="okf-setup__hint">Expect JSON with hits.</p>
    </div>
  );
}
