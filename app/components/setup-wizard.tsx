'use client';
import { useState } from 'react';
import type { SetupInput } from '../lib/setup-actions';

type Result = { ok: true; token: string; mcpCommand: string } | { ok: false; error: string };
type BundleSource = 'example' | 'local' | 'git';

const STEP_TITLES = ['Name this workspace', 'Choose a knowledge bundle', 'Set an admin password'];

export function SetupWizard({ onComplete }: { onComplete: (input: SetupInput) => Promise<Result> }) {
  const [step, setStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState('');
  const [bundleSource, setBundleSource] = useState<BundleSource>('example');
  const [localPath, setLocalPath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; mcpCommand: string } | null>(null);

  function stepValid(): boolean {
    if (step === 0) return workspaceName.trim().length > 0;
    if (step === 1) {
      if (bundleSource === 'local') return localPath.trim().length > 0;
      if (bundleSource === 'git') return /^https:\/\//.test(gitUrl.trim());
      return true;
    }
    return adminPassword.length >= 8;
  }

  async function finish() {
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
    <section className="okf-setup">
      <div className="okf-setup__steps" aria-label={`Step ${step + 1} of 3`}>
        {STEP_TITLES.map((t, i) => (
          <span key={t} className={`okf-setup__dot${i === step ? ' is-current' : i < step ? ' is-done' : ''}`} />
        ))}
        <span className="okf-setup__steplabel">Step {step + 1} of 3 · {STEP_TITLES[step]}</span>
      </div>

      {step === 0 && (
        <>
          <h1>Welcome to OKF Hub</h1>
          <p className="okf-setup__lede">Three quick steps — nothing is saved until you finish.</p>
          <div className="okf-setup__help">
            <p><b>What</b> — a label for this hub.</p>
            <p><b>Why</b> — it appears in the header and settings so your team recognizes this instance.</p>
            <p><b>How</b> — type a short name.</p>
          </div>
          <label>Workspace name
            <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Data" />
          </label>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Choose a knowledge bundle</h1>
          <div className="okf-setup__help">
            <p><b>What</b> — the folder of Markdown concepts this hub serves.</p>
            <p><b>Why</b> — everything browsable and searchable comes from here.</p>
            <p><b>How</b> — pick a source below.</p>
          </div>
          <fieldset className="okf-setup__bundle">
            <legend>Bundle source</legend>
            <label><input type="radio" name="src" checked={bundleSource === 'example'} onChange={() => setBundleSource('example')} /> Use the example bundle</label>
            <p className="okf-setup__hint">Not sure yet? Start with sample data — you can change this in Settings later.</p>
            <label><input type="radio" name="src" checked={bundleSource === 'local'} onChange={() => setBundleSource('local')} /> Local directory path</label>
            {bundleSource === 'local' && (
              <>
                <input aria-label="local path" value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="/srv/okf-bundle" />
                <p className="okf-setup__hint">A folder already on this server. Must contain at least one .md file.</p>
              </>
            )}
            <label><input type="radio" name="src" checked={bundleSource === 'git'} onChange={() => setBundleSource('git')} /> Clone a public git URL</label>
            {bundleSource === 'git' && (
              <>
                <input aria-label="git url" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/org/okf-bundle.git" />
                <p className="okf-setup__hint">Public https:// URL only. We clone it once; private/loopback hosts are rejected.</p>
              </>
            )}
          </fieldset>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Set an admin password</h1>
          <div className="okf-setup__help">
            <p><b>What</b> — the admin credential for this hub.</p>
            <p><b>Why</b> — changing settings later (rename, rotate the token, switch bundle) requires it, so a visitor can't reconfigure your hub.</p>
            <p><b>How</b> — at least 8 characters.</p>
          </div>
          <label>Admin password
            <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="at least 8 characters" />
          </label>
          {adminPassword.length > 0 && adminPassword.length < 8 && (
            <p className="okf-setup__hint">{8 - adminPassword.length} more character(s) needed.</p>
          )}
          <div className="okf-setup__summary">
            You&rsquo;re about to create — Workspace: <b>{workspaceName || '—'}</b> · Bundle: <b>{bundleSource}</b>
          </div>
        </>
      )}

      {error && <p className="okf-setup__error" role="alert">{error}</p>}

      <div className="okf-setup__nav">
        {step > 0 && (
          <button type="button" className="okf-setup__back" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}>← Back</button>
        )}
        {step < 2 && (
          <button type="button" onClick={() => setStep(step + 1)} disabled={!stepValid()}>Next →</button>
        )}
        {step === 2 && (
          <button type="button" onClick={finish} disabled={!stepValid() || busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>
        )}
      </div>
    </section>
  );
}
