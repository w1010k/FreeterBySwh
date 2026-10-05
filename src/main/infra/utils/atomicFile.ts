/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { open, rename, rm, writeFile } from 'node:fs/promises';

// Suffix of the scratch file writeFileAtomic writes before renaming it over the
// target. Code that lists a folder written this way skips names ending with it.
export const tmpSuffix = '.tmp';

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
  try {
    await rename(tmpPath, filePath);
  } catch {
    // On Windows the rename fails while the target is open elsewhere: another
    // process (antivirus, indexer, an editor) or this app's own
    // copyFileDataStorage, which runs outside the per-file queue. Fall back to
    // the in-place write so the save is not lost; it is the pre-atomic
    // behavior, only for this rare case.
    await writeFile(filePath, data, { encoding: 'utf-8' });
    await rm(tmpPath, { force: true });
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
