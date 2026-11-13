/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, extname, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsDirEntry, FsSearchHit } from '@common/base/fs';

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
// Folders of one search level read at the same time: overlaps disk (or network share) round trips, without flooding the
// I/O thread pool other main-process file work shares.
const searchReadBatch = 16;

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
    search: async (roots, query, { includeHidden, maxResults, maxScanned }) => {
      const hits: FsSearchHit[] = [];
      let scanned = 0;
      // Overlapping roots (C:\Work and C:\Work\Docs) reach the same folders: each folder is read once. The deeper root
      // is on an earlier level, so it claims its folders and its hits get the shorter location.
      const seenDirs = new Set<string>();
      // Breadth-first, level by level, so a huge deep folder (node_modules) uses up the limits only after the shallow
      // levels of every root were searched.
      let level = roots.map((dir, rootIndex) => ({ dir: resolve(dir), root: resolve(dir), rootIndex }));
      while (level.length > 0) {
        const next: typeof level = [];
        for (let i = 0; i < level.length; i += searchReadBatch) {
          const batch = level.slice(i, i + searchReadBatch).filter(d => !seenDirs.has(d.dir));
          batch.forEach(d => seenDirs.add(d.dir));
          // No access, or removed meanwhile: nothing listed, search the rest.
          const listed = await Promise.all(batch.map(d => readdir(d.dir, { withFileTypes: true }).catch((): Dirent[] => [])));
          for (let j = 0; j < batch.length; j++) {
            const { dir, root, rootIndex } = batch[j];
            const folder = relative(root, dir).split(sep).join('/');
            for (const item of listed[j]) {
              if (!includeHidden && item.name.startsWith('.')) {
                continue;
              }
              if (++scanned > maxScanned) {
                return { hits, limit: 'scanned' };
              }
              const path = join(dir, item.name);
              // A Dirent describes the link itself, so a symlinked folder is not a directory here and is not entered
              // (no loops through links).
              const isDirectory = item.isDirectory();
              // NFC: macOS gives decomposed (NFD) names, which Korean typed in NFC would not match otherwise.
              if (item.name.normalize('NFC').toLowerCase().includes(query)) {
                hits.push({ name: item.name, path, isDirectory, rootIndex, folder });
                if (hits.length >= maxResults) {
                  return { hits, limit: 'results' };
                }
              }
              if (isDirectory) {
                next.push({ dir: path, root, rootIndex });
              }
            }
          }
        }
        level = next;
      }
      return { hits, limit: null };
    },
    getHomeDir: () => homedir(),
    getImageDataUrl: async (path): Promise<string | null> => {
      const mime = imageMimeByExt[extname(path).toLowerCase()];
      if (!mime) {
        return null;
      }
      try {
        // Check the size before reading, so a huge file is never loaded into main memory.
        if ((await stat(path)).size > maxImageBytes) {
          return null;
        }
        const buf = await readFile(path);
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        return null;
      }
    },
  }
}
