import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readConfig, setupState } from '../../lib/config';
import { buildAgentCommands } from '../../lib/agent-commands';
import { originFromHeaders } from '../../lib/request-origin';
import { CopyButton } from '../components/copy-button';

export const dynamic = 'force-dynamic';

function CommandRow({ label, cmd, note }: { label: string; cmd: string; note?: string }) {
  return (
    <>
      <p className="okf-setup__hint"><b>{label}</b>{note ? ` — ${note}` : ''}</p>
      <div className="okf-setup__copyrow">
        <pre><code>{cmd}</code></pre>
        <CopyButton text={cmd} />
      </div>
    </>
  );
}

export default async function GuidePage() {
  if (setupState() === 'first-run') redirect('/setup');
  const origin = originFromHeaders(await headers());
  const cfg = readConfig();
  const workspaces = cfg?.workspaces ?? [];
  const defaultSlug = cfg?.defaultWorkspace ?? null;
  const legacy = buildAgentCommands(origin, null);

  return (
    <main className="okf-setup okf-screen okf-guide">
      <h1>Guide</h1>
      <p className="okf-setup__lede">How to connect agents to this hub, record work, and query the knowledge.</p>

      <section className="okf-setup__ws">
        <h2>How this hub works</h2>
        <p className="okf-setup__hint">
          A <b>bundle</b> (a folder of Markdown concepts) is served as browsable, searchable knowledge.
          <b> Agents</b> connect over MCP or REST with a workspace&rsquo;s <b>ingestion token</b>: they search and read
          the knowledge, and <b>record completed work</b> back in as WorkRecords (see the <a href="/work">Work timeline</a>).
          Each workspace has its own bundle, index, token, and URLs.
        </p>
      </section>

      {workspaces.length === 0 ? (
        <section className="okf-setup__ws">
          <h2>This hub {cfg ? 'workspace' : '(configured via environment)'}</h2>
          <p className="okf-setup__hint">Replace <code>&lt;TOKEN&gt;</code> with your ingestion token{cfg ? '' : ' (the OKF_INGEST_TOKEN env value)'}.</p>
          <CommandRow label="Connect an agent" cmd={legacy.mcpAdd} note="run where Claude Code is installed" />
          <CommandRow label="Record work" cmd={legacy.curlRecord} note="expect HTTP 201" />
          <CommandRow label="Search" cmd={legacy.curlSearch} note="expect JSON with hits" />
        </section>
      ) : (
        workspaces.map((ws) => {
          const cmd = buildAgentCommands(origin, ws.slug);
          return (
            <section key={ws.slug} className="okf-setup__ws">
              <h2>{ws.name} {defaultSlug === ws.slug && <span className="okf-setup__badge">default</span>}</h2>
              <p className="okf-setup__hint">
                /w/{ws.slug} · API base: <code>{origin}/w/{ws.slug}/api/v1</code> · MCP: <code>{origin}/w/{ws.slug}/api/mcp</code>
                {defaultSlug === ws.slug && <> · also served at the legacy <code>{origin}/api/…</code> URLs</>}
              </p>
              <p className="okf-setup__hint">
                Replace <code>&lt;TOKEN&gt;</code> with this workspace&rsquo;s ingestion token — it was shown once when the
                workspace was created (or last rotated). Lost it? <a href="/setup">Rotate it in Settings</a>.
              </p>
              <CommandRow label="Connect an agent" cmd={cmd.mcpAdd} note="run where Claude Code is installed" />
              <CommandRow label="Record work" cmd={cmd.curlRecord} note="expect HTTP 201" />
              <CommandRow label="Search" cmd={cmd.curlSearch} note="expect JSON with hits" />
            </section>
          );
        })
      )}

      <section className="okf-setup__ws">
        <h2>Manage workspaces</h2>
        <p className="okf-setup__hint">
          In <a href="/setup">Settings</a> (admin): add a workspace (its token and connect command are shown once) ·
          rotate a token (the old one stops working immediately) · change a bundle · set the default workspace
          (which the legacy <code>/api/…</code> URLs and the home page serve).
        </p>
      </section>

      <section className="okf-setup__ws">
        <h2>Troubleshooting</h2>
        <table className="okf-guide__table">
          <tbody>
            <tr><td><code>401</code></td><td>Wrong token, or a token from a different workspace — tokens are workspace-scoped.</td></tr>
            <tr><td><code>503</code></td><td>Ingestion not configured — finish <a href="/setup">setup</a> or set <code>OKF_INGEST_TOKEN</code>.</td></tr>
            <tr><td><code>404 unknown workspace</code></td><td>The <code>/w/&lt;slug&gt;</code> in the URL doesn&rsquo;t exist — check Settings for the exact slug.</td></tr>
            <tr><td>path does not exist</td><td>Bundle paths must be absolute on the server; <code>~</code> is not expanded; the folder needs at least one top-level <code>.md</code>.</td></tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
