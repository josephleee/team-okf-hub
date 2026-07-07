'use server';
import { headers } from 'next/headers';
import {
  readConfig, writeConfig, setupState, workspaceSlug, getWorkspace,
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

export async function completeSetup(
  input: SetupInput,
): Promise<{ ok: true; slug: string; token: string } | { ok: false; error: string }> {
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
  return { ok: true, slug, token };
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

export async function rotateToken(slug: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  const token = generateToken();
  writeConfig(updateWorkspace(cfg, slug, { ingestTokenHash: hashToken(token) }));
  return { ok: true, token };
}

export async function renameWorkspace(slug: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  if (!name.trim()) return { ok: false, error: 'name is required' };
  writeConfig(updateWorkspace(cfg, slug, { name: name.trim() }));
  return { ok: true };
}

export async function changeBundle(
  slug: string,
  input: { source: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  const bundle = resolveBundle({ bundleSource: input.source, localPath: input.localPath, gitUrl: input.gitUrl });
  if (!bundle.ok) return bundle;
  writeConfig(updateWorkspace(cfg, slug, { bundle: bundle.bundle }));
  resetService(slug);
  return { ok: true };
}

export async function addWorkspace(
  input: { name: string; bundleSource: 'example' | 'local' | 'git'; localPath?: string; gitUrl?: string },
): Promise<{ ok: true; slug: string; token: string } | { ok: false; error: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!input.name?.trim()) return { ok: false, error: 'workspace name is required' };
  const bundle = resolveBundle(input);
  if (!bundle.ok) return bundle;
  const slug = workspaceSlug(input.name.trim(), cfg.workspaces.map((w) => w.slug));
  const token = generateToken();
  const workspace: WorkspaceConfig = {
    slug,
    name: input.name.trim(),
    bundle: bundle.bundle,
    ingestTokenHash: hashToken(token),
    createdAt: new Date().toISOString(),
  };
  writeConfig({ ...cfg, workspaces: [...cfg.workspaces, workspace] });
  return { ok: true, slug, token };
}

export async function deleteWorkspace(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  if (cfg.workspaces.length <= 1) return { ok: false, error: 'cannot delete the last workspace' };
  const remaining = cfg.workspaces.filter((w) => w.slug !== slug);
  const defaultWorkspace = cfg.defaultWorkspace === slug ? remaining[0]!.slug : cfg.defaultWorkspace;
  writeConfig({ ...cfg, workspaces: remaining, defaultWorkspace });
  resetService(slug);
  return { ok: true };
}

export async function setDefaultWorkspace(slug: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdmin())) return { ok: false, error: 'admin login required' };
  const cfg = readConfig();
  if (!cfg) return { ok: false, error: 'not configured' };
  if (!getWorkspace(slug)) return { ok: false, error: 'unknown workspace' };
  writeConfig({ ...cfg, defaultWorkspace: slug });
  return { ok: true };
}
