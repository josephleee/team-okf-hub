// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Nav } from './nav';

afterEach(cleanup);

describe('Nav', () => {
  it('renders links to home, search, and graph', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /OKF Hub/i })).toHaveProperty('href');
    expect(screen.getByRole('link', { name: /search/i }).getAttribute('href')).toBe('/search');
    expect(screen.getByRole('link', { name: /graph/i }).getAttribute('href')).toBe('/graph');
  });
});
