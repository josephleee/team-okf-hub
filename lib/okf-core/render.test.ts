import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
  it('renders headings and emphasis to HTML', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text.');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('').trim()).toBe('');
  });
});

describe('renderMarkdown sanitization', () => {
  it('strips javascript: link URLs but keeps the link text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
  });

  it('keeps GFM tables and code after sanitizing', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | `x` |');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>x</code>');
  });
});
