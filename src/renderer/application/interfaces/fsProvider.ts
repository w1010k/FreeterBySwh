/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry, FsSearchOptions, FsSearchResult, ReadDirOptions } from '@common/base/fs';

export interface FsProvider {
  readDir: (dirPath: string, opts?: ReadDirOptions) => Promise<FsDirEntry[]>;
  search: (roots: string[], query: string, opts?: FsSearchOptions) => Promise<FsSearchResult>;
  getHomeDir: () => Promise<string>;
  getImageDataUrl: (path: string) => Promise<string | null>;
}
