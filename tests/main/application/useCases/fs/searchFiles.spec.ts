/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSearchFilesUseCase, fsSearchMaxResults, fsSearchMaxScanned } from '@/application/useCases/fs/searchFiles';
import { mockFsProvider } from '@tests/infra/mocks/fsProvider';

function setup() {
  const search = jest.fn(async () => ({ hits: [], limit: null }));
  const searchFilesUseCase = createSearchFilesUseCase({ fsProvider: mockFsProvider({ search }) });
  return { search, searchFilesUseCase };
}

describe('searchFilesUseCase()', () => {
  it('searches with the query trimmed, lowercased and NFC-normalized, and the fixed limits', async () => {
    const { search, searchFilesUseCase } = setup();
    // '한' typed as decomposed jamo (NFD) must match a name stored as one syllable (NFC).
    await searchFilesUseCase(['/a', '/b'], '  Re\u1112\u1161\u11ab  ', { includeHidden: false });

    expect(search).toHaveBeenCalledWith(['/a', '/b'], 're한', { includeHidden: false, maxResults: fsSearchMaxResults, maxScanned: fsSearchMaxScanned });
  });

  it('includes hidden entries unless told not to', async () => {
    const { search, searchFilesUseCase } = setup();
    await searchFilesUseCase(['/a'], 'x');

    expect(search).toHaveBeenCalledWith(['/a'], 'x', expect.objectContaining({ includeHidden: true }));
  });

  it('returns no hits for a blank query without searching', async () => {
    const { search, searchFilesUseCase } = setup();

    await expect(searchFilesUseCase(['/a'], '   ')).resolves.toEqual({ hits: [], limit: null });
    expect(search).not.toHaveBeenCalled();
  });

  it.each([
    ['roots not an array', '/a', 'x'],
    ['a root not a string', ['/a', 1], 'x'],
    ['an empty root', ['/a', ' '], 'x'],
    ['a sparse roots array', new Array(2), 'x'],
    ['too many roots', new Array(101).fill('/a'), 'x'],
    ['a query not a string', ['/a'], 1],
    ['a too long query', ['/a'], 'x'.repeat(201)],
  ])('rejects %s', async (_name, roots, query) => {
    const { search, searchFilesUseCase } = setup();

    await expect(searchFilesUseCase(roots, query)).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});
