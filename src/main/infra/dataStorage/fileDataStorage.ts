/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdir, rm, readFile, readdir, stat, unlink, cp } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import { DataStorage } from '@common/application/interfaces/dataStorage';
import { existsSync } from 'node:original-fs';
// Keys never map to a temp file name: storageKeyToFilePath turns '.' into '_'.
import { createInOrder, tmpSuffix, writeFileAtomic } from '@/infra/utils/atomicFile';

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
  // ponytail: clear(), getKeys() and copyFileDataStorage() act on the whole
  // folder and are not ordered against these per-file operations.
  const inOrder = createInOrder();

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
