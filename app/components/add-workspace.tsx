'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from './copy-button';
import { AgentSnippets } from './agent-snippets';

type AddInput = { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string };
type AddResult = { ok: true; slug: string; token: string; mcpCommand: string } | { ok: false; error: string };

export function AddWorkspacePanel({ onAdd }: { onAdd: (input: AddInput) => Promise<AddResult> }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [bundleSource, setBundleSource] = useState<'example' | 'local' | 'git'>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; token: string; mcpCommand: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onAdd({ name, bundleSource, localPath, gitUrl });
      if (res.ok) {
        setDone({ slug: res.slug, token: res.token, mcpCommand: res.mcpCommand });
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add workspace');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="okf-setup__row">
        <h2>Workspace "{done.slug}" created ✓</h2>
        <p className="okf-setup__warn">Copy this workspace&rsquo;s ingestion token now — it will not be shown again.</p>
        <div className="okf-setup__copyrow">
          <pre className="okf-setup__token"><code>{done.token}</code></pre>
          <CopyButton text={done.token} />
        </div>
        <h3>Try it now — this workspace only</h3>
        <AgentSnippets slug={done.slug} token={done.token} />
      </section>
    );
  }

  return (
    <form className="okf-setup__row" onSubmit={submit}>
      <h2>Add a workspace</h2>
      <p className="okf-setup__hint">Each workspace has its own bundle, search index, token, and URL (/w/&lt;slug&gt;).</p>
      <label>New workspace name
        <input aria-label="new workspace name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Labs" />
      </label>
      <fieldset className="okf-setup__bundle">
        <legend>Bundle source</legend>
        <label><input type="radio" name="add-src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
        <label><input type="radio" name="add-src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
        {bundleSource === 'local' && (
          <>
            <input aria-label="new local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
            <p className="okf-setup__hint">Absolute path on the server — ~ is not expanded. Needs at least one .md file at its top level. e.g. /srv/okf-bundle.</p>
          </>
        )}
        <label><input type="radio" name="add-src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
        {bundleSource === 'git' && (
          <input aria-label="new git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
        )}
      </fieldset>
      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add workspace'}</button>
    </form>
  );
}
