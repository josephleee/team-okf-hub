import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { getService, resetService } from './service';

describe('resetService', () => {
  it('returns a fresh service instance after reset', async () => {
    process.env.OKF_BUNDLE_DIR = join(process.cwd(), 'bundles/example');
    const a = await getService();
    resetService();
    const b = await getService();
    expect(b).not.toBe(a);
    a.close?.();
    b.close?.();
  });
});
