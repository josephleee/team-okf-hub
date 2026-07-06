'use client';
import { useState } from 'react';
import type { SetupInput } from '../lib/setup-actions';
import { CopyButton } from './copy-button';

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
      // Workspace and password are gated client-side, so a failure with a local/git
      // source is a bundle-validation problem — send the user back to the bundle step
      // to fix the path/URL. The example bundle can't produce one, so leave that error
      // in place on the finish step (avoids misdirecting a non-bundle error like a race).
      else { setError(res.error); if (bundleSource !== 'example') setStep(1); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'setup failed');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !stepValid()) return;
    if (step < 2) { setError(null); setStep(step + 1); }
    else void finish();
  }

  if (done) return <SetupDone token={done.token} mcpCommand={done.mcpCommand} />;

  return (
    <form className="okf-setup" onSubmit={handleSubmit}>
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
          <button type="submit" disabled={!stepValid()}>Next →</button>
        )}
        {step === 2 && (
          <button type="submit" disabled={!stepValid() || busy}>{busy ? 'Setting up…' : 'Finish setup'}</button>
        )}
      </div>
    </form>
  );
}

function SetupDone({ token, mcpCommand }: { token: string; mcpCommand: string }) {
  return (
    <section className="okf-setup okf-setup--done">
      <h1>Setup complete ✓</h1>
      <p className="okf-setup__help">
        This hub now serves your <b>knowledge bundle</b> — the folder of Markdown concepts you chose.
        The token and command below connect your AI agents (Claude Code) to it, so they can
        <b> search the knowledge</b> here and <b>record the work they finish</b> back into it.
      </p>

      <h2>Your ingestion token</h2>
      <p className="okf-setup__hint">A bearer credential that lets an agent read and write this hub (via MCP + REST). Shown once and stored only as a hash — copy it now.</p>
      <div className="okf-setup__copyrow">
        <pre className="okf-setup__token"><code>{token}</code></pre>
        <CopyButton text={token} />
      </div>

      <h2>Connect an agent (MCP)</h2>
      <p className="okf-setup__hint">Run this where Claude Code is installed. It registers this hub as an MCP server, giving agents tools to search &amp; read concepts and record completed work.</p>
      <div className="okf-setup__copyrow">
        <pre><code>{mcpCommand}</code></pre>
        <CopyButton text={mcpCommand} />
      </div>

      <div className="okf-setup__note">
        <b>What this applies to:</b> this hub and the bundle you chose — <b>not your code repo</b>, and it does not scan or
        auto-document a codebase. Everything already in the bundle is searchable now; agents&rsquo; work records are added from here on.
      </div>

      <h2>What&rsquo;s next</h2>
      <p><a href="/">Browse the hub →</a> · <a href="/work">Work timeline →</a> · <a href="/setup">Manage settings →</a></p>
    </section>
  );
}
