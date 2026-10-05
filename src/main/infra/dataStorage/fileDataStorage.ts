/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdir, rm, readFile, writeFile, readdir, stat, unlink, cp, rename, open } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import { DataStorage } from '@common/application/interfaces/dataStorage';
import { existsSync } from 'node:original-fs';

// Suffix of the scratch file setText writes before renaming it over the target.
// Keys never map to it: storageKeyToFilePath turns '.' into '_'.
const tmpSuffix = '.tmp';

/**
 * Write `data` to `filePath` so an app crash, power loss or full disk never
 * leaves the target truncated: write a sibling temp file, flush it to disk, then
 * rename it over the target (an atomic replace within one folder). Without the
 * flush, power loss can persist the rename but not the bytes.
 */
async function writeFileAtomic(filePath: string, data: string) {
  const tmpPath = filePath + tmpSuffix;
  const tmpFile = await open(tmpPath, 'w');
  try {
    await tmpFile.writeFile(data, { encoding: 'utf-8' });
    await tmpFile.sync();
  } finally {
    await tmpFile.close();
  }
  try {
    await rename(tmpPath, filePath);
  } catch {
    // On Windows the rename fails while the target is open elsewhere: another
    // process (antivirus, indexer) or this app's own copyFileDataStorage, which
    // runs outside the per-file queue. Fall back to the in-place write so the
    // save is not lost; it is the pre-atomic behavior, only for this rare case.
    await writeFile(filePath, data, { encoding: 'utf-8' });
    await rm(tmpPath, { force: true });
  }
}

async function getAllKeys(normStorageDirPath: string) {
  try {
    const items = await readdir(normStorageDirPath);
    return (await Promise.all(items.map(async item => {
      const filePath = join(normStorageDirPath, item);
      // A leftover temp file (crash between write and rename) is not a key.
      if (!item.endsWith(tmpSuffix) && (await stat(filePath)).isFile()) {
        return item;
      } else {
        return '';
      }
    }))).filter(item => !!item);
  } catch {
    return undefined;
  }
}
async function clearStorage(normStorageDirPath: string) {
  let items: string[];
  try {
    items = await readdir(normStorageDirPath);
  } catch (e) {
    return undefined;
  }

  if (items) {
    await Promise.all(items.map(async item => {
      const filePath = join(normStorageDirPath, item);
      // Skip temp files: a write in flight renames its temp file away between
      // readdir and stat, and the failing stat would reject the whole clear.
      if (!item.endsWith(tmpSuffix) && (await stat(filePath)).isFile()) {
        await unlink(filePath);
      }
    }))
  }

  return undefined;
}

function storageKeyToFilePath(normStorageDirPath: string, key: string): string | undefined {
  if (!key) {
    return undefined;
  }
  return join(normStorageDirPath, key.replace(/[^A-Za-z0-9_\-()\s]/g, '_'));
}

export async function createFileDataStorage(dataType: 'string', storageDirPath: string): Promise<DataStorage> {
  const normStorageDirPath = normalize(storageDirPath);
  try {
    await mkdir(normStorageDirPath, { recursive: true });
  } catch (err) {
    // Surface the failure: a silently-failed mkdir means every later read/write
    // to this storage dir fails with no clue why. Don't throw — callers treat
    // storage as best-effort, but make the root cause visible in the logs.
    console.error(`Failed to create data storage directory "${normStorageDirPath}":`, err);
  }

  // Per-file queue: get/set/delete on one file run in call order, so a read
  // issued right after a write sees the new content (e.g. a widget that flushes
  // its pending save on unmount and remounts at once, as when moved between
  // worktable and shelf). It also keeps two writes from sharing the temp file.
  // Different files still run in parallel; an entry is dropped once it settles.
  // ponytail: clear(), getKeys() and copyFileDataStorage() act on the whole
  // folder and are not ordered against these per-file operations.
  const queues = new Map<string, Promise<void>>();
  const inOrder = <T>(filePath: string, op: () => Promise<T>): Promise<T> => {
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

  return {
    deleteItem: async (key) => {
      const filePath = storageKeyToFilePath(normStorageDirPath, key);
      if (filePath) {
        await inOrder(filePath, () => rm(filePath, { force: true }))
      }
    },
    getText: async (key) => {
      try {
        const filePath = storageKeyToFilePath(normStorageDirPath, key);
        if (filePath) {
          return await inOrder(filePath, () => readFile(filePath, { encoding: 'utf-8' }))
        } else {
          return undefined;
        }
      } catch (err) {
        // Callers treat every failure as "no item", so a missing file stays silent,
        // but any other read error is logged: otherwise it is indistinguishable.
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          console.error(`Failed to read data storage item '${key}':`, err);
        }
        return undefined;
      }
    },
    setText: async (key, data) => {
      try {
        const filePath = storageKeyToFilePath(normStorageDirPath, key);
        if (filePath) {
          return await inOrder(filePath, () => writeFileAtomic(filePath, data))
        } else {
          return undefined;
        }
      } catch (err) {
        // The write error is still swallowed (callers don't expect a rejection),
        // but logged so a lost save leaves a trace.
        // ponytail: the renderer's change-check caches already count this value as
        // saved, so an identical retry is skipped; fixing that needs the IPC contract to reject.
        console.error(`Failed to write data storage item '${key}':`, err);
        return undefined;
      }
    },
    clear: async () => await clearStorage(normStorageDirPath),
    getKeys: async () => (await getAllKeys(normStorageDirPath) || [])
  }
}

export async function copyFileDataStorage(fromStorageDirPath: string, toStorageDirPath: string): Promise<boolean> {
  const normFromStorageDirPath = normalize(fromStorageDirPath);
  if (!existsSync(normFromStorageDirPath)) {
    return true;
  }
  const normToStorageDirPath = normalize(toStorageDirPath);
  try {
    await mkdir(normToStorageDirPath, { recursive: true });
    // Skip temp files: a write in flight renames its temp file away after cp
    // lists it, and the copy would fail with ENOENT (the clone then loses data).
    await cp(normFromStorageDirPath, normToStorageDirPath, { recursive: true, filter: src => !src.endsWith(tmpSuffix) });
  } catch (err) {
    return false;
  }

  return true;
}
