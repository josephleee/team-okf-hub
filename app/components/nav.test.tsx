// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Nav } from './nav';

afterEach(cleanup);

describe('Nav', () => {
  it('renders the brand link to home and a search box', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /OKF Hub/i }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /new/i }).getAttribute('href')).toBe('/concept/new');
  });

  it('links to the work timeline', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /^Work$/ }).getAttribute('href')).toBe('/work');
  });

  it('links to setup/settings', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /settings/i }).getAttribute('href')).toBe('/setup');
  });

  it('links to the guide', () => {
    render(<Nav />);
    expect(screen.getByRole('link', { name: /^Guide$/ }).getAttribute('href')).toBe('/guide');
  });
});
