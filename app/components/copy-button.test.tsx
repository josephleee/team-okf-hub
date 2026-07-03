// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CopyButton } from './copy-button';

afterEach(cleanup);

describe('CopyButton', () => {
  it('copies the text and shows a transient "Copied!" state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton text="SECRET123" />);
    const btn = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SECRET123'));
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it('does not throw when clipboard is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });
    render(<CopyButton text="x" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /copy/i }))).not.toThrow();
  });
});
