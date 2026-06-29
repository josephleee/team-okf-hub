// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ConceptList } from './concept-list';

afterEach(cleanup);

describe('ConceptList', () => {
  const groups = [
    { type: 'BigQuery Table', concepts: [{ path: 'tables/orders.md', title: 'Orders' }] },
    { type: 'Metric', concepts: [{ path: 'metrics/wau.md', title: 'WAU' }] },
  ];

  it('renders each type heading and links to each concept', () => {
    render(<ConceptList groups={groups} />);
    expect(screen.getByText('BigQuery Table')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Orders' });
    expect(link.getAttribute('href')).toBe('/concept/tables/orders.md');
  });
});
