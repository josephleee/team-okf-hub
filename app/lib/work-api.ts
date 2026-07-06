import 'server-only';
import { getService, resetService } from './service';
import { buildWorkRecordSource, type WorkRecordInput } from '../../lib/work-record';
import { saveContent } from '../../lib/edit-ops';
import { resolveBundleDir } from '../../lib/config';
import type { ValidationIssue } from '../../lib/okf-core/types';
import type { WorkRow, SearchHit, ConceptRow, GraphData } from '../../lib/db/queries';

async function knownPaths(slug?: string): Promise<Set<string>> {
  const svc = await getService(slug);
  return new Set(svc.concepts().map((c) => c.path));
}

export async function recordWork(
  input: WorkRecordInput,
  slug?: string,
): Promise<{ ok: boolean; path: string; issues: ValidationIssue[] }> {
  const missing = (['title', 'summary', 'actor'] as const).filter(
    (k) => !(typeof input?.[k] === 'string' && input[k]!.trim()),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      path: '',
      issues: [{ path: '', severity: 'error', field: 'input', message: `missing required: ${missing.join(', ')}` }],
    };
  }
  const now = new Date().toISOString();
  const { path, content } = buildWorkRecordSource(input, now);
  let result: Awaited<ReturnType<typeof saveContent>>;
  try {
    result = await saveContent(resolveBundleDir(slug), path, content, await knownPaths(slug));
  } catch (err) {
    return {
      ok: false,
      path: '',
      issues: [{ path: '', severity: 'error', field: 'write', message: err instanceof Error ? err.message : String(err) }],
    };
  }
  if (result.ok) resetService(slug); // clears the workspace's cached service; omitted slug clears all (single-ws legacy)
  return { ok: result.ok, path: result.ok ? path : '', issues: result.issues };
}

export async function recentWork(
  filter: { project?: string; actor?: string; limit?: number } = {},
  slug?: string,
): Promise<WorkRow[]> {
  return (await getService(slug)).recentWork(filter);
}

export async function searchMemory(query: string, slug?: string): Promise<SearchHit[]> {
  return (await getService(slug)).search(query);
}

export async function getConceptFull(path: string, slug?: string): Promise<ConceptRow | undefined> {
  return (await getService(slug)).concept(path);
}

export async function graph(path: string, depth?: number, slug?: string): Promise<GraphData> {
  return (await getService(slug)).graph(path, depth);
}
