import { setupState, readConfig } from '../../lib/config';
import { isAdmin } from '../lib/admin-session';
import {
  completeSetup, adminLogin, rotateToken, renameWorkspace, changeBundle,
  addWorkspace, deleteWorkspace, setDefaultWorkspace,
} from '../lib/setup-actions';
import { SetupWizard } from '../components/setup-wizard';
import { RotateTokenPanel } from '../components/rotate-token';
import { AdminLogin } from '../components/admin-login';
import { AddWorkspacePanel } from '../components/add-workspace';
import { WorkspaceDeleteButton } from '../components/workspace-delete';

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

  const admin = await isAdmin();
  if (!admin) {
    return (
      <main className="okf-setup okf-screen">
        <AdminLogin onLogin={adminLogin} />
      </main>
    );
  }

  const cfg = readConfig();
  const workspaces = cfg?.workspaces ?? [];

  return (
    <main className="okf-setup okf-screen">
      <h1>Workspaces</h1>
      <p className="okf-setup__lede">Signed in as admin. Each workspace has its own bundle, token, and URL; agents connect per workspace.</p>

      {workspaces.map((ws) => (
        <section key={ws.slug} className="okf-setup__ws">
          <div className="okf-setup__ws-head">
            <h2>{ws.name} {cfg?.defaultWorkspace === ws.slug && <span className="okf-setup__badge">default</span>}</h2>
            <span className="okf-setup__hint">/w/{ws.slug} · bundle: {ws.bundle.source} · {ws.bundle.path}</span>
          </div>
          <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await renameWorkspace(ws.slug, String(fd.get('name') ?? '')); }}>
            <label>Workspace name <input name="name" defaultValue={ws.name} /></label>
            <p className="okf-setup__hint">Display name only — the URL slug /w/{ws.slug} never changes.</p>
            <button type="submit">Rename</button>
          </form>
          <RotateTokenPanel onRotate={rotateToken.bind(null, ws.slug)} />
          <form className="okf-setup__row" action={async (fd: FormData) => { 'use server'; await changeBundle(ws.slug, { source: String(fd.get('source') ?? 'example') as 'example' | 'local' | 'git', localPath: String(fd.get('localPath') ?? ''), gitUrl: String(fd.get('gitUrl') ?? '') }); }}>
            <p className="okf-setup__hint">example = built-in sample data · local = a folder on this server (needs a .md file) · git = clone a public https:// repo.</p>
            <label>Bundle source
              <select name="source" defaultValue={ws.bundle.source}>
                <option value="example">example</option>
                <option value="local">local path</option>
                <option value="git">git url</option>
              </select>
            </label>
            <input name="localPath" aria-label={`bundle local path for ${ws.slug}`} placeholder="/srv/okf-bundle (for local)" />
            <input name="gitUrl" aria-label={`bundle git url for ${ws.slug}`} placeholder="https://… (for git)" />
            <button type="submit">Change bundle</button>
          </form>
          <div className="okf-setup__row okf-setup__ws-actions">
            {cfg?.defaultWorkspace !== ws.slug && (
              <form action={async () => { 'use server'; await setDefaultWorkspace(ws.slug); }}>
                <button type="submit">Make default</button>
              </form>
            )}
            <WorkspaceDeleteButton slug={ws.slug} name={ws.name} onDelete={deleteWorkspace} />
          </div>
        </section>
      ))}

      <AddWorkspacePanel onAdd={addWorkspace} />
    </main>
  );
}
