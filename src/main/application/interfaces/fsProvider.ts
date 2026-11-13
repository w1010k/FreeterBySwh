/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry, FsSearchResult, ReadDirOptions } from '@common/base/fs';

export interface FsSearchLimits {
  includeHidden: boolean;
  /** Stop after this many hits. */
  maxResults: number;
  /** Stop after looking at this many entries. */
  maxScanned: number;
}

export interface FsProvider {
  readDir: (dirPath: string, opts?: ReadDirOptions) => Promise<FsDirEntry[]>;
  /** Finds files and folders under `roots` whose name contains `query` (lowercase, NFC), shallow levels first. */
  search: (roots: string[], query: string, limits: FsSearchLimits) => Promise<FsSearchResult>;
  getHomeDir: () => string;
  /** Read an image file as a base64 data URL, or null if unreadable/unsupported/too large. */
  getImageDataUrl: (path: string) => Promise<string | null>;
}
