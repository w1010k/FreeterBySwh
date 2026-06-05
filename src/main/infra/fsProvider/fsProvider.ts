/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsDirEntry } from '@common/base/fs';

export function createFsProvider(): FsProvider {
  return {
    readDir: async (dirPath): Promise<FsDirEntry[]> => {
      const items = await readdir(dirPath, { withFileTypes: true });
      return Promise.all(items.map(async item => {
        const path = join(dirPath, item.name);
        const isDirectory = item.isDirectory();
        let size = 0;
        if (!isDirectory) {
          try {
            size = (await stat(path)).size;
          } catch {
            size = 0;
          }
        }
        return { name: item.name, path, isDirectory, size };
      }));
    },
    getHomeDir: () => homedir()
  }
}
