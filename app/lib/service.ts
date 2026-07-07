import 'server-only';
import { createService, type OkfService } from '../../lib/okf-service';
import { resolveBundleDir, defaultWorkspaceSlug } from '../../lib/config';

const cache = globalThis as unknown as { __okfServices?: Map<string, Promise<OkfService>> };

function services(): Map<string, Promise<OkfService>> {
  if (!cache.__okfServices) cache.__okfServices = new Map();
  return cache.__okfServices;
}

function keyFor(slug?: string): string {
  return slug ?? defaultWorkspaceSlug() ?? '__default';
}

export function getService(slug?: string): Promise<OkfService> {
  const map = services();
  const key = keyFor(slug);
  let entry = map.get(key);
  if (!entry) {
    entry = createService(resolveBundleDir(slug));
    map.set(key, entry);
  }
  return entry;
}

function closeEntry(entry: Promise<OkfService> | undefined): void {
  if (entry) entry.then((svc) => svc.close()).catch(() => {});
}

export function resetService(slug?: string): void {
  const map = services();
  if (slug === undefined) {
    for (const entry of map.values()) closeEntry(entry);
    map.clear();
    return;
  }
  const key = keyFor(slug);
  closeEntry(map.get(key));
  map.delete(key);
}
