import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createService } from './okf-service';

const EXAMPLE = join(process.cwd(), 'bundles/example');

describe('createService (on the example bundle)', () => {
  it('loads, indexes, and answers queries end-to-end', async () => {
    const svc = await createService(EXAMPLE);
    try {
      expect(svc.concepts().length).toBe(5);
      expect(svc.concept('tables/orders.md')?.title).toBe('Orders');
      expect(svc.search('orders').length).toBeGreaterThan(0);
      expect(svc.backlinks('tables/orders.md').map((c) => c.path)).toContain(
        'metrics/weekly_active_users.md',
      );
      expect(svc.graph('tables/orders.md', 1).nodes.length).toBeGreaterThan(1);
      expect(svc.issues().filter((i) => i.severity === 'error')).toEqual([]);
    } finally {
      svc.close();
    }
  });
});
