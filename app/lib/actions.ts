'use server';
import { getService, resetService } from './service';
import { validateContent, saveContent } from '../../lib/edit-ops';
import { resolveBundleDir } from '../../lib/config';
import type { ValidationIssue } from '../../lib/okf-core/types';

async function knownPaths(slug?: string): Promise<Set<string>> {
  const svc = await getService(slug);
  return new Set(svc.concepts().map((c) => c.path));
}

export async function validateAction(
  path: string,
  content: string,
  slug?: string,
): Promise<{ issues: ValidationIssue[]; html: string }> {
  return validateContent(path, content, await knownPaths(slug));
}

export async function saveAction(
  path: string,
  content: string,
  slug?: string,
): Promise<{ ok: boolean; issues: ValidationIssue[] }> {
  const result = await saveContent(resolveBundleDir(slug), path, content, await knownPaths(slug));
  if (result.ok) resetService(slug);
  return result;
}
