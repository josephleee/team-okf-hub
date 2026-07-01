import 'server-only';
import { createService, type OkfService } from '../../lib/okf-service';
import { resolveBundleDir } from '../../lib/config';

const cache = globalThis as unknown as { __okfService?: Promise<OkfService> };

export function getService(): Promise<OkfService> {
  if (!cache.__okfService) {
    cache.__okfService = createService(resolveBundleDir());
  }
  return cache.__okfService;
}

export function resetService(): void {
  const previous = cache.__okfService;
  cache.__okfService = undefined;
  if (previous) {
    previous.then((svc) => svc.close()).catch(() => {});
  }
}
