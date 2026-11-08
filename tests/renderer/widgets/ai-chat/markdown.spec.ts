/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { renderMarkdown } from '@/widgets/ai-chat/markdown';

describe('renderMarkdown()', () => {
  it('renders the usual markdown: emphasis, lists, code, tables', () => {
    const html = renderMarkdown('**bold** and `code`\n\n- one\n- two\n\n```\na < b\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('a &lt; b');
    expect(html).toContain('<table>');
  });

  it('shows raw HTML as text, so an answer cannot run script in Freeter', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });

  it('keeps only http, https and mailto links, marked to open outside Freeter', () => {
    expect(renderMarkdown('[site](https://example.com/a?b=1&c=2)')).toContain('<a href="https://example.com/a?b=1&amp;c=2" data-external>site</a>');
    expect(renderMarkdown('[mail](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
    const bad = renderMarkdown('[x](javascript:alert(1)) [y](file:///C:/a.exe)');
    expect(bad).not.toContain('<a');
    expect(bad).toContain('x');
  });

  it('drops a link the URL parser cannot read', () => {
    expect(renderMarkdown('[x](https://)')).not.toContain('<a');
  });

  it('reuses the result for the same text (a view mounting again does not parse every answer)', () => {
    const text = '**reuse** me';
    expect(renderMarkdown(text)).toBe(renderMarkdown(text));
    expect(renderMarkdown(text)).toContain('<strong>reuse</strong>');
  });

  it('shows images as their alt text (no remote loads)', () => {
    const html = renderMarkdown('![a cat](https://example.com/cat.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('a cat');
  });
});
