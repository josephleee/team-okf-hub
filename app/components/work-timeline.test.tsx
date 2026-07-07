// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WorkTimeline } from './work-timeline';
import type { WorkView } from '../lib/data';

afterEach(cleanup);

const view: WorkView = {
  filter: {},
  total: 1,
  groups: [
    {
      date: '2026-07-01',
      items: [
        { path: 'work/p/2026-07-01-120000-ship.md', title: 'Ship it', actor: 'jungsup', project: 'p', timestamp: '2026-07-01T12:00:00Z', tags: ['feature'], artifacts: ['https://x/pr/1'] },
      ],
    },
  ],
};

describe('WorkTimeline', () => {
  it('renders a record linking to its concept page, with actor/project/artifact', () => {
    render(<WorkTimeline view={view} />);
    expect(screen.getByRole('link', { name: 'Ship it' }).getAttribute('href')).toBe('/concept/work/p/2026-07-01-120000-ship.md');
    expect(screen.getByRole('link', { name: 'jungsup' }).getAttribute('href')).toBe('/work?actor=jungsup');
    expect(screen.getByRole('link', { name: 'p' }).getAttribute('href')).toBe('/work?project=p');
    expect(screen.getByRole('link', { name: 'https://x/pr/1' }).getAttribute('href')).toBe('https://x/pr/1');
  });

  it('shows an empty state with a runnable example and a guide link', async () => {
    render(<WorkTimeline view={{ filter: {}, total: 0, groups: [] }} />);
    expect(screen.getByText(/No work records yet/i)).toBeTruthy();
    expect(await screen.findByText(/curl -X POST http:\/\/localhost:3000\/api\/v1\/work/)).toBeTruthy(); // jsdom origin
    expect(screen.getByRole('link', { name: /read the guide/i }).getAttribute('href')).toBe('/guide');
  });

  it('renders https artifact link but blocks javascript: scheme', () => {
    const maliciousView: WorkView = {
      filter: {},
      total: 1,
      groups: [
        {
          date: '2026-07-01',
          items: [
            {
              path: 'work/p/2026-07-01-120000-ship.md',
              title: 'Ship it',
              actor: 'jungsup',
              project: 'p',
              timestamp: '2026-07-01T12:00:00Z',
              tags: [],
              artifacts: ['https://ok.example/pr/1', 'javascript:alert(1)'],
            },
          ],
        },
      ],
    };
    render(<WorkTimeline view={maliciousView} />);
    expect(screen.getByRole('link', { name: 'https://ok.example/pr/1' }).getAttribute('href')).toBe('https://ok.example/pr/1');
    expect(screen.queryByText('javascript:alert(1)')).toBeNull();
  });
});
