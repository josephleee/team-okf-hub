// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConceptDetail } from './concept-detail';
import type { ConceptView } from '../lib/data';

afterEach(cleanup);

const view: ConceptView = {
  path: 'tables/orders.md', type: 'BigQuery Table', title: 'Orders',
  description: 'One row per order.', resource: 'https://example.com/orders',
  tags: ['sales', 'revenue'], timestamp: '2026-05-28T14:30:00Z',
  html: '<h1>Schema</h1><table><tr><td>x</td></tr></table>',
  outbound: [{ path: 'tables/customers.md', title: 'Customers', type: 'BigQuery Table' }],
  backlinks: [{ path: 'metrics/wau.md', title: 'WAU', type: 'Metric' }],
};

describe('ConceptDetail', () => {
  it('renders title, type, tags, the rendered HTML, outbound links and backlinks', () => {
    render(<ConceptDetail view={view} />);
    expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy();
    expect(screen.getByText('BigQuery Table')).toBeTruthy();
    expect(screen.getByText('sales')).toBeTruthy();
    expect(screen.getByText('Schema')).toBeTruthy(); // from dangerouslySetInnerHTML
    expect(screen.getByRole('link', { name: 'Customers' }).getAttribute('href')).toBe('/concept/tables/customers.md');
    expect(screen.getByRole('link', { name: 'WAU' }).getAttribute('href')).toBe('/concept/metrics/wau.md');
  });
});
