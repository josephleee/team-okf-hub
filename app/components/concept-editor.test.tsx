// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ConceptEditor } from './concept-editor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

afterEach(cleanup);

const okValidate = vi.fn(async () => ({ issues: [], html: '<p>preview</p>' }));

describe('ConceptEditor', () => {
  it('renders the initial content and a Save button', () => {
    render(<ConceptEditor path="x.md" initialContent="hello" onValidate={okValidate} onSave={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello');
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy();
  });

  it('disables Save and shows the error when validation reports an error', async () => {
    const onValidate = vi.fn(async () => ({
      issues: [{ path: 'x.md', severity: 'error' as const, field: 'type', message: '`type` is required' }],
      html: '',
    }));
    render(<ConceptEditor path="x.md" initialContent="bad" onValidate={onValidate} onSave={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/`type` is required/)).toBeTruthy());
    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onSave with the edited content', async () => {
    const onSave = vi.fn(async () => ({ ok: true, issues: [] }));
    render(<ConceptEditor path="x.md" initialContent="hi" onValidate={okValidate} onSave={onSave} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('x.md', 'edited'));
  });
});
