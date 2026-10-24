/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { open, rename } from 'node:fs/promises';

// Suffix of the scratch file writeFileAtomic writes before renaming it over the
// target. Code that lists a folder written this way skips names ending with it.
export const tmpSuffix = '.tmp';
const renameAttempts = 4;
const transientRenameErrors = new Set(['EBUSY', 'EACCES', 'EPERM']);

/**
 * Write `data` to `filePath` so an app crash, power loss or full disk never
 * leaves the target truncated: write a sibling temp file, flush it to disk, then
 * rename it over the target (an atomic replace within one folder). Without the
 * flush, power loss can persist the rename but not the bytes.
 * Two calls on one file must not overlap (they share the temp file): run them
 * through a `createInOrder` queue.
 * `mode` gives the new file the permission bits of the file it replaces; the
 * temp file would otherwise get the umask default.
 */
export async function writeFileAtomic(filePath: string, data: string, mode?: number) {
  const tmpPath = filePath + tmpSuffix;
  const tmpFile = await open(tmpPath, 'w');
  try {
    if (mode !== undefined) {
      await tmpFile.chmod(mode);
    }
    await tmpFile.writeFile(data, { encoding: 'utf-8' });
    await tmpFile.sync();
  } finally {
    await tmpFile.close();
  }
  for (let attempt = 1; attempt <= renameAttempts; attempt++) {
    try {
      await rename(tmpPath, filePath);
      return;
    } catch (err) {
      // AV/indexers can briefly hold a Windows sharing lock. Retry the atomic
      // replace only; an in-place fallback could truncate the last good copy.
      if (attempt === renameAttempts || !transientRenameErrors.has((err as NodeJS.ErrnoException).code ?? '')) {
        throw err;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 25 * attempt));
    }
  }
}

/**
 * Per-file queue: operations on one file path run in call order, so a read
 * issued right after a write sees the new content, and two writes never share
 * the temp file. Different files still run in parallel; an entry is dropped
 * once it settles.
 */
export function createInOrder() {
  const queues = new Map<string, Promise<void>>();
  return <T>(filePath: string, op: () => Promise<T>): Promise<T> => {
    const run = (queues.get(filePath) ?? Promise.resolve()).then(op);
    const settled = run.then(() => undefined, () => undefined);
    queues.set(filePath, settled);
    settled.then(() => {
      if (queues.get(filePath) === settled) {
        queues.delete(filePath);
      }
    });
    return run;
  };
}
