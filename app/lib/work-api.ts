import 'server-only';
import { getService, resetService } from './service';
import { buildWorkRecordSource, type WorkRecordInput } from '../../lib/work-record';
import { saveContent } from '../../lib/edit-ops';
import type { ValidationIssue } from '../../lib/okf-core/types';
import type { WorkRow, SearchHit, ConceptRow, GraphData } from '../../lib/db/queries';

const bundleDir = () => process.env.OKF_BUNDLE_DIR ?? 'bundles/example';

async function knownPaths(): Promise<Set<string>> {
  const svc = await getService();
  return new Set(svc.concepts().map((c) => c.path));
}

export async function recordWork(
  input: WorkRecordInput,
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
    result = await saveContent(bundleDir(), path, content, await knownPaths());
  } catch (err) {
    return {
      ok: false,
      path: '',
      issues: [{ path: '', severity: 'error', field: 'write', message: err instanceof Error ? err.message : String(err) }],
    };
  }
  if (result.ok) resetService(); // synchronous — clears the cached singleton before returning; the next getService() rebuilds
  return { ok: result.ok, path: result.ok ? path : '', issues: result.issues };
}

export async function recentWork(
  filter: { project?: string; actor?: string; limit?: number } = {},
): Promise<WorkRow[]> {
  return (await getService()).recentWork(filter);
}

export async function searchMemory(query: string): Promise<SearchHit[]> {
  return (await getService()).search(query);
}

export async function getConceptFull(path: string): Promise<ConceptRow | undefined> {
  return (await getService()).concept(path);
}

export async function graph(path: string, depth?: number): Promise<GraphData> {
  return (await getService()).graph(path, depth);
}
