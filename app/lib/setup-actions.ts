'use server';
import { headers } from 'next/headers';
import {
  readConfig, writeConfig, setupState, workspaceSlug,
  type OkfConfig, type BundleConfig, type WorkspaceConfig,
} from '../../lib/config';
import { generateToken, hashToken, hashPassword, verifyPassword, randomSecret } from '../../lib/secrets';
import { validateLocalPath, cloneGitBundle } from '../../lib/bundle-source';
import { resetService } from './service';
import { isAdmin, setAdminSession, clearAdminSession } from './admin-session';

export interface SetupInput {
  workspaceName: string;
  bundleSource: 'example' | 'local' | 'git';
  localPath?: string;
  gitUrl?: string;
  adminPassword: string;
}

interface BundleInput {
  bundleSource: 'example' | 'local' | 'git';
  localPath?: string;
  gitUrl?: string;
}

function resolveBundle(input: BundleInput): { ok: true; bundle: BundleConfig } | { ok: false; error: string } {
  if (input.bundleSource === 'example') {
    return { ok: true, bundle: { source: 'example', path: 'bundles/example' } };
  }
  if (input.bundleSource === 'local') {
    const r = validateLocalPath((input.localPath ?? '').trim());
    return r.ok ? { ok: true, bundle: { source: 'local', path: r.path } } : r;
  }
  const r = cloneGitBundle((input.gitUrl ?? '').trim());
  return r.ok ? { ok: true, bundle: { source: 'git', path: r.path, gitUrl: (input.gitUrl ?? '').trim() } } : r;
}

async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').split(',')[0]?.trim() === 'https';
}

function buildMcpCommand(slug: string, token: string): string {
  return `claude mcp add --transport http okf-${slug} http://localhost:3000/w/${slug}/api/mcp --header "Authorization: Bearer ${token}"`;
}

export async function completeSetup(
  input: SetupInput,
): Promise<{ ok: true; token: string; mcpCommand: string } | { ok: false; error: string }> {
  if (setupState() !== 'first-run') return { ok: false, error: 'setup already completed' };
  if (!input.workspaceName?.trim()) return { ok: false, error: 'workspace name is required' };
  if (!input.adminPassword || input.adminPassword.length < 8) {
    return { ok: false, error: 'admin password must be at least 8 characters' };
  }
  const bundle = resolveBundle(input);
  if (!bundle.ok) return bundle;

  const now = new Date().toISOString();
  const token = generateToken();
  const slug = workspaceSlug(input.workspaceName.trim(), []);
  const workspace: WorkspaceConfig = {
    slug,
    name: input.workspaceName.trim(),
    bundle: bundle.bundle,
    ingestTokenHash: hashToken(token),
    createdAt: now,
  };
  const config: OkfConfig = {
    version: 2,
    adminPasswordHash: hashPassword(input.adminPassword),
    sessionSecret: randomSecret(),
    setupComplete: true,
    defaultWorkspace: slug,
    workspaces: [workspace],
    createdAt: now,
  };
  writeConfig(config);
  resetService();
  return { ok: true, token, mcpCommand: buildMcpCommand(slug, token) };
}

export async function adminLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = readConfig();
  if (!cfg?.setupComplete) return { ok: false, error: 'not configured' };
  if (!verifyPassword(password, cfg.adminPasswordHash)) return { ok: false, error: 'wrong password' };
  await setAdminSession(await isSecureRequest());
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  await clearAdminSession();
}

function updateWorkspace(
  cfg: OkfConfig, slug: string, patch: Partial<WorkspaceConfig>,
): OkfConfig {
  return { ...cfg, workspaces: cfg.workspaces.map((w) => (w.slug === slug ? { ...w, ...patch } : w)) };
}

export async function rotateToken(): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const token = generateToken();
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { ingestTokenHash: hashToken(token) }));
  return { ok: true, token };
}

export async function renameWorkspace(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!name.trim()) return { ok: false, error: 'name is required' };
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { name: name.trim() }));
  return { ok: true };
}

export async function changeBundle(
  input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  const bundle = resolveBundle({ bundleSource: input.source, localPath: input.localPath, gitUrl: input.gitUrl });
  if (!bundle.ok) return bundle;
  writeConfig(updateWorkspace(cfg, cfg.defaultWorkspace, { bundle: bundle.bundle }));
  resetService();
  return { ok: true };
}
