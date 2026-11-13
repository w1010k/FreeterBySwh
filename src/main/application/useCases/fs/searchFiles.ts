/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsSearchResult } from '@common/base/fs';

// A longer result list is not read; the widget asks for a narrower query instead.
export const fsSearchMaxResults = 200;
// Bounds the disk work of one search (a home folder with node_modules has millions of entries).
export const fsSearchMaxScanned = 50000;
const maxRoots = 100;
const maxQueryChars = 200;

interface Deps {
  fsProvider: FsProvider;
}

export function createSearchFilesUseCase({ fsProvider }: Deps) {
  // The arguments come from the renderer over IPC: checked here, not trusted by type.
  return async function searchFilesUseCase(roots: unknown, query: unknown, opts?: unknown): Promise<FsSearchResult> {
    if (!Array.isArray(roots) || roots.length > maxRoots) {
      throw new Error('Invalid search roots');
    }
    for (let i = 0; i < roots.length; i++) {
      if (typeof roots[i] !== 'string' || roots[i].trim() === '') {
        throw new Error('Invalid search roots');
      }
    }
    if (typeof query !== 'string' || query.length > maxQueryChars) {
      throw new Error('Invalid search query');
    }
    const q = query.trim().normalize('NFC').toLowerCase();
    if (q === '') {
      return { hits: [], limit: null };
    }
    const includeHidden = !(typeof opts === 'object' && opts !== null && 'includeHidden' in opts && opts.includeHidden === false);
    return fsProvider.search(roots as string[], q, { includeHidden, maxResults: fsSearchMaxResults, maxScanned: fsSearchMaxScanned });
  }
}

export type SearchFilesUseCase = ReturnType<typeof createSearchFilesUseCase>;
