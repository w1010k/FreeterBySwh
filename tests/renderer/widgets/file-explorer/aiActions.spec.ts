/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { fileExplorerAiActions } from '@/widgets/file-explorer/aiActions';

const search = fileExplorerAiActions.find(a => a.name === 'search')!;

describe('fileExplorerAiActions.search', () => {
  it('is a read action (no confirm box)', () => {
    expect(search.kind).toBe('read');
  });

  it.each([
    [{ query: 'report' }, { query: 'report' }],
    [{ query: '' }, undefined],
    [{ query: '   ' }, undefined],
    [{ query: 3 }, undefined],
    [{}, undefined],
    [{ query: 'x'.repeat(201) }, undefined],
  ])('parses %p', (input, expected) => {
    expect(search.parse(input)).toEqual(expected);
  });

  it('returns the widget search result', async () => {
    const value = { hits: [{ name: 'a.txt', path: '/d/a.txt', isDirectory: false, location: 'd' }], limit: null };
    const api = { fileExplorer: { search: jest.fn(async () => value) } };

    await expect(search.run({ api, settings: {} }, { query: 'a' })).resolves.toEqual({ ok: true, value });
    expect(api.fileExplorer.search).toHaveBeenCalledWith('a');
  });

  it('answers not_ready when the widget is not mounted, and failed when the search fails', async () => {
    await expect(search.run({ api: {}, settings: {} }, { query: 'a' })).resolves.toMatchObject({ ok: false, code: 'not_ready' });
    const api = { fileExplorer: { search: jest.fn(async () => { throw new Error('x'); }) } };
    await expect(search.run({ api, settings: {} }, { query: 'a' })).resolves.toMatchObject({ ok: false, code: 'failed' });
  });

  it('names the query and the widget in its description line', () => {
    expect(search.describe({ query: 'q3' }, 'Docs', {})).toBe('Search "q3" in file explorer widget "Docs"');
  });
});
