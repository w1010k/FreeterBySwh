/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry, ReadDirOptions, TextFileContent } from '@common/base/fs';

export interface FsProvider {
  readDir: (dirPath: string, opts?: ReadDirOptions) => Promise<FsDirEntry[]>;
  getHomeDir: () => string;
  /** Read an image file as a base64 data URL, or null if unreadable/unsupported/too large. */
  getImageDataUrl: (path: string) => Promise<string | null>;
  /** Read a Markdown file as UTF-8 text with its mtime, or null if refused/missing/too large. */
  readTextFile: (path: string) => Promise<TextFileContent | null>;
  /** Overwrite an existing Markdown file atomically; resolves to the new mtime, or null if refused/failed. */
  writeTextFile: (path: string, text: string) => Promise<number | null>;
  /** A file's mtime in ms, or null when it is missing or not a file. */
  getMtime: (path: string) => Promise<number | null>;
}
