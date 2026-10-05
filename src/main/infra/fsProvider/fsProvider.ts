/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsDirEntry, isMarkdownPath } from '@common/base/fs';
import { createInOrder, writeFileAtomic } from '@/infra/utils/atomicFile';

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
// Text files above this size are not opened: the whole file travels over IPC
// and into the editor in one piece.
const maxTextFileBytes = 10 * 1024 * 1024;

export function createFsProvider(): FsProvider {
  // Orders reads and writes on one text file, so a read after a save sees the
  // saved bytes and two saves never share writeFileAtomic's temp file. Keyed by
  // the real path, so two spellings of one file (or a symlink and its target)
  // share a queue.
  const inOrder = createInOrder();
  const realPathOf = (path: string) => realpath(path).catch(() => path);

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
    // The renderer may read and write only Markdown files through these
    // channels; the extension check lives here, behind the IPC boundary.
    readTextFile: async (path) => {
      if (!isMarkdownPath(path)) {
        return null;
      }
      return inOrder(await realPathOf(path), async () => {
        try {
          // stat before read: if the file changes in between, the older mtime
          // makes the caller's next getMtime differ, so the change is not missed.
          const st = await stat(path);
          if (!st.isFile() || st.size > maxTextFileBytes) {
            return null;
          }
          const text = await readFile(path, { encoding: 'utf-8' });
          return { text, mtimeMs: st.mtimeMs };
        } catch {
          return null;
        }
      });
    },
    writeTextFile: async (path, text) => {
      if (!isMarkdownPath(path)) {
        return null;
      }
      // Write the symlink's target: renaming the temp file over the link itself
      // would replace the link with a plain file.
      const target = await realPathOf(path);
      return inOrder(target, async () => {
        try {
          // Overwrite only: the widget edits files that exist, it never creates one.
          const st = await stat(target);
          if (!st.isFile()) {
            return null;
          }
          await writeFileAtomic(target, text, st.mode);
          return (await stat(target)).mtimeMs;
        } catch (err) {
          console.error(`Failed to write text file "${path}":`, err);
          return null;
        }
      });
    },
    getMtime: async (path) => {
      try {
        const st = await stat(path);
        return st.isFile() ? st.mtimeMs : null;
      } catch {
        return null;
      }
    }
  }
}
