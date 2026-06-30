'use server';
import { getService, resetService } from './service';
import { validateContent, saveContent } from '../../lib/edit-ops';
import type { ValidationIssue } from '../../lib/okf-core/types';

const bundleDir = () => process.env.OKF_BUNDLE_DIR ?? 'bundles/example';

async function knownPaths(): Promise<Set<string>> {
  const svc = await getService();
  return new Set(svc.concepts().map((c) => c.path));
}

export async function validateAction(
  path: string,
  content: string,
): Promise<{ issues: ValidationIssue[]; html: string }> {
  return validateContent(path, content, await knownPaths());
}

export async function saveAction(
  path: string,
  content: string,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const result = await saveContent(bundleDir(), path, content, await knownPaths());
  if (result.ok) resetService();
  return result;
}
