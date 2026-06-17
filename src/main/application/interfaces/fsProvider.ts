/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry, ReadDirOptions } from '@common/base/fs';

export interface FsProvider {
  readDir: (dirPath: string, opts?: ReadDirOptions) => Promise<FsDirEntry[]>;
  getHomeDir: () => string;
  /** Read an image file as a base64 data URL, or null if unreadable/unsupported/too large. */
  getImageDataUrl: (path: string) => Promise<string | null>;
  /** Write UTF-8 text to a path, creating parent dirs. Returns false on failure. */
  writeTextFile: (path: string, text: string) => Promise<boolean>;
}
