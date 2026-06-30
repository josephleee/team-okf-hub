import 'server-only';
import { createService, type OkfService } from '../../lib/okf-service';

const cache = globalThis as unknown as { __okfService?: Promise<OkfService> };

export function getService(): Promise<OkfService> {
  if (!cache.__okfService) {
    cache.__okfService = createService(process.env.OKF_BUNDLE_DIR ?? 'bundles/example');
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
