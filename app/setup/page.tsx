import { setupState, readConfig } from '../../lib/config';
import { isAdmin } from '../lib/admin-session';
import { completeSetup, adminLogin, rotateToken, renameWorkspace, changeBundle } from '../lib/setup-actions';
import { SetupWizard } from '../components/setup-wizard';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const state = setupState();

  if (state === 'env-configured') {
    return (
      <main className="okf-setup okf-screen">
        <h1>Configured via environment</h1>
        <p>This instance is configured with <code>OKF_INGEST_TOKEN</code> / <code>OKF_BUNDLE_DIR</code>. Unset them to use web setup.</p>
      </main>
    );
  }

  if (state === 'first-run') {
    return (
      <main className="okf-setup okf-screen">
        <SetupWizard onComplete={completeSetup} />
      </main>
    );
  }

  // file-configured → require admin
  const admin = await isAdmin();
  const cfg = readConfig();
  if (!admin) {
    return (
      <main className="okf-setup okf-screen">
        <form className="okf-setup" action={async (fd: FormData) => { 'use server'; await adminLogin(String(fd.get('password') ?? '')); }}>
          <h1>Admin login</h1>
          <label>Password <input name="password" type="password" aria-label="admin password" /></label>
          <button type="submit">Log in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="okf-setup okf-screen">
      <h1>Settings — {cfg?.workspaceName}</h1>
      <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await renameWorkspace(String(fd.get('name') ?? '')); }}>
        <label>Workspace name <input name="name" defaultValue={cfg?.workspaceName} /></label>
        <button type="submit">Rename</button>
      </form>
      <form className="okf-setup__row" action={async () => { 'use server'; await rotateToken(); }}>
        <p>Rotate the ingestion token (the old token stops working immediately).</p>
        <button type="submit">Rotate token</button>
      </form>
      <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await changeBundle({ source: String(fd.get('source') ?? 'example') as 'example' | 'local' | 'git', localPath: String(fd.get('localPath') ?? ''), gitUrl: String(fd.get('gitUrl') ?? '') }); }}>
        <label>Bundle source
          <select name="source" defaultValue={cfg?.bundle.source}>
            <option value="example">example</option>
            <option value="local">local path</option>
            <option value="git">git url</option>
          </select>
        </label>
        <input name="localPath" aria-label="settings local path" placeholder="/srv/okf-bundle (for local)" />
        <input name="gitUrl" aria-label="settings git url" placeholder="https://…​ (for git)" />
        <button type="submit">Change bundle</button>
      </form>
      <p className="okf-setup__note">Current bundle: <code>{cfg?.bundle.source}</code> · <code>{cfg?.bundle.path}</code></p>
    </main>
  );
}
