// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SearchResults } from './search-results';

afterEach(cleanup);

describe('SearchResults', () => {
  it('lists hits with links when there are results', () => {
    render(<SearchResults view={{ query: 'orders', hits: [
      { path: 'tables/orders.md', title: 'Orders', snippet: '…<mark>orders</mark>…' },
    ] }} />);
    expect(screen.getByRole('link', { name: /Orders/ }).getAttribute('href')).toBe('/concept/tables/orders.md');
  });

  it('shows an empty-state message when the query has no hits', () => {
    render(<SearchResults view={{ query: 'zzz', hits: [] }} />);
    expect(screen.getByText(/no results/i)).toBeTruthy();
  });
});
