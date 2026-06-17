/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { homedir } from 'node:os';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsDirEntry } from '@common/base/fs';

const imageMimeByExt: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};
const maxImageBytes = 20 * 1024 * 1024;

export function createFsProvider(): FsProvider {
  return {
    readDir: async (dirPath, opts): Promise<FsDirEntry[]> => {
      const { includeHidden = true, includeSizes = true } = opts ?? {};
      const items = await readdir(dirPath, { withFileTypes: true });
      const visible = includeHidden ? items : items.filter(item => !item.name.startsWith('.'));
      return Promise.all(visible.map(async item => {
        const path = join(dirPath, item.name);
        const isDirectory = item.isDirectory();
        let size = 0;
        // Skip the extra per-file stat() when sizes won't be shown — on large
        // directories this halves the syscall count.
        if (!isDirectory && includeSizes) {
          try {
            size = (await stat(path)).size;
          } catch {
            size = 0;
          }
        }
        return { name: item.name, path, isDirectory, size };
      }));
    },
    getHomeDir: () => homedir(),
    getImageDataUrl: async (path): Promise<string | null> => {
      const mime = imageMimeByExt[extname(path).toLowerCase()];
      if (!mime) {
        return null;
      }
      try {
        const buf = await readFile(path);
        if (buf.byteLength > maxImageBytes) {
          return null;
        }
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        return null;
      }
    },
    writeTextFile: async (path, text): Promise<boolean> => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, text, { encoding: 'utf-8' });
        return true;
      } catch {
        return false;
      }
    }
  }
}
