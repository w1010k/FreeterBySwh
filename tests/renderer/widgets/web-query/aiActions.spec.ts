/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { webQueryAiActions } from '@/widgets/web-query/aiActions';
import { fixtureEntry, fixtureSettings } from '@tests/widgets/web-query/fixtures';

const [query] = webQueryAiActions;

describe('webQueryAiActions', () => {
  it('query runs the widget query with the entry index (default 0)', async () => {
    const run = jest.fn(() => true);
    await expect(Promise.resolve(query.run({ api: { query: run }, settings: {} }, { text: 'cats' }))).resolves.toEqual({ ok: true, value: null });
    expect(run).toHaveBeenCalledWith('cats', 0);
  });

  it('answers not_found for an entry the widget does not have, and not_ready without the api', async () => {
    await expect(Promise.resolve(query.run({ api: { query: () => false }, settings: {} }, { text: 'x', entry: 3 }))).resolves.toMatchObject({ code: 'not_found' });
    await expect(Promise.resolve(query.run({ api: {}, settings: {} }, { text: 'x' }))).resolves.toMatchObject({ code: 'not_ready' });
  });

  it('parse needs non-empty text and a non-negative integer entry', () => {
    expect(query.parse({ text: '' })).toBeUndefined();
    expect(query.parse({ text: 'x', entry: -1 })).toBeUndefined();
    expect(query.parse({ text: 'x', entry: 1 })).toEqual({ text: 'x', entry: 1 });
  });

  it('describes the query with the entry description', () => {
    const settings = fixtureSettings({ entries: [fixtureEntry({ engine: '', descr: 'Docs search', url: 'https://d.test/?q=QUERY' })] });
    expect(query.describe({ text: 'cats' }, 'Search', settings)).toBe('Run query "cats" (Docs search) in web query widget "Search"');
  });
});
