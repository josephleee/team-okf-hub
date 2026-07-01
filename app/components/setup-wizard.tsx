'use client';
import { useState } from 'react';
import type { SetupInput } from '../lib/setup-actions';

type Result = { ok: true; token: string; mcpCommand: string } | { ok: false; error: string };

export function SetupWizard({ onComplete }: { onComplete: (input: SetupInput) => Promise<Result> }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [bundleSource, setBundleSource] = useState<'example' | 'local' | 'git'>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; mcpCommand: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onComplete({ workspaceName, bundleSource, localPath, gitUrl, adminPassword });
      if (res.ok) setDone({ token: res.token, mcpCommand: res.mcpCommand });
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'setup failed');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="okf-setup okf-setup--done">
        <h1>Setup complete ✓</h1>
        <p className="okf-setup__warn">Copy your ingestion token now — it will not be shown again.</p>
        <pre className="okf-setup__token"><code>{done.token}</code></pre>
        <h2>Connect an agent (MCP)</h2>
        <pre><code>{done.mcpCommand}</code></pre>
        <p><a href="/">Go to the hub →</a> · <a href="/work">Work timeline →</a></p>
      </section>
    );
  }

  return (
    <form className="okf-setup" onSubmit={submit}>
      <h1>Welcome to OKF Hub</h1>
      <p className="okf-setup__lede">Configure this instance. Nothing is saved until you finish.</p>

      <label>Workspace name
        <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Data" />
      </label>

      <fieldset className="okf-setup__bundle">
        <legend>Bundle source</legend>
        <label><input type="radio" name="src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
        <label><input type="radio" name="src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
        {bundleSource === 'local' && (
          <input aria-label="local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
        )}
        <label><input type="radio" name="src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
        {bundleSource === 'git' && (
          <input aria-label="git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
        )}
      </fieldset>

      <label>Admin password
        <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="protects future settings changes" />
      </label>

      {error && <p className="okf-setup__error" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>
    </form>
  );
}
