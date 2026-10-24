/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdir, rm, readFile, readdir, stat, unlink, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { DataStorage } from '@common/application/interfaces/dataStorage';
// Keys never map to a temp file name: storageKeyToFilePath turns '.' into '_'.
import { createInOrder, tmpSuffix, writeFileAtomic } from '@/infra/utils/atomicFile';

interface StorageQueue {
  inOrder: ReturnType<typeof createInOrder>;
  barrier: Promise<void>;
  pending: Set<Promise<unknown>>;
}

// Look up the queue for every operation, not once per storage instance. This
// shares ordering across instances/copies and lets idle entries leave the map.
const storageQueues = new Map<string, StorageQueue>();
const pathKey = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

function getStorageQueue(dirPath: string): readonly [string, StorageQueue] {
  const key = pathKey(dirPath);
  let queue = storageQueues.get(key);
  if (!queue) {
    queue = { inOrder: createInOrder(), barrier: Promise.resolve(), pending: new Set() };
    storageQueues.set(key, queue);
  }
  return [key, queue];
}

function trackOperation<T>(entries: ReadonlyArray<readonly [string, StorageQueue]>, operation: Promise<T>): Promise<T> {
  for (const [, queue] of entries) {
    queue.pending.add(operation);
  }
  const settled = () => {
    for (const [key, queue] of entries) {
      queue.pending.delete(operation);
      if (queue.pending.size === 0 && storageQueues.get(key) === queue) {
        storageQueues.delete(key);
      }
    }
  };
  operation.then(settled, settled);
  return operation;
}

function runFileOperation<T>(dirPath: string, filePath: string, op: () => Promise<T>): Promise<T> {
  const entry = getStorageQueue(dirPath);
  const queue = entry[1];
  return trackOperation([entry], queue.barrier.then(() => queue.inOrder(pathKey(filePath), op)));
}

function runFolderOperation<T>(dirPaths: string[], op: () => Promise<T>): Promise<T> {
  const entries = [...new Set(dirPaths.map(pathKey))].map(getStorageQueue);
  const earlier = entries.flatMap(([, queue]) => [...queue.pending]);
  const result = Promise.allSettled(earlier).then(op);
  // Reserve every involved folder synchronously, before any asynchronous work.
  // Opposite-direction copies then wait in call order without lock deadlocks.
  const barrier = result.then(() => undefined, () => undefined);
  for (const [, queue] of entries) {
    queue.barrier = barrier;
  }
  return trackOperation(entries, result);
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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
async function clearStorage(normStorageDirPath: string) {
  let items: string[];
  try {
    items = await readdir(normStorageDirPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }

  if (items) {
    const results = await Promise.allSettled(items.map(async item => {
      const filePath = join(normStorageDirPath, item);
      // Failed writes and interrupted earlier runs may leave a scratch file.
      if (!item.endsWith(tmpSuffix) && (await stat(filePath)).isFile()) {
        await unlink(filePath);
      }
    }));
    // A rejected deletion must not release the folder barrier while another
    // deletion is still running and could remove a later write.
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') {
      throw failed.reason;
    }
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
  const normStorageDirPath = resolve(storageDirPath);
  try {
    await mkdir(normStorageDirPath, { recursive: true });
  } catch (err) {
    // Surface the failure: a silently-failed mkdir means every later read/write
    // to this storage dir fails with no clue why. Don't throw — callers treat
    // storage as best-effort, but make the root cause visible in the logs.
    console.error(`Failed to create data storage directory "${normStorageDirPath}":`, err);
  }

  const run = <T>(filePath: string, op: () => Promise<T>) => runFileOperation(normStorageDirPath, filePath, op);

  return {
    deleteItem: async (key) => {
      const filePath = storageKeyToFilePath(normStorageDirPath, key);
      if (filePath) {
        await run(filePath, () => rm(filePath, { force: true }))
      }
    },
    getText: async (key) => {
      try {
        const filePath = storageKeyToFilePath(normStorageDirPath, key);
        if (filePath) {
          return await run(filePath, () => readFile(filePath, { encoding: 'utf-8' }))
        } else {
          return undefined;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          return undefined;
        }
        // An unreadable file is not an empty file: callers must not overwrite it
        // with defaults or consider its existing contents absent.
        console.error(`Failed to read data storage item '${key}':`, err);
        throw err;
      }
    },
    setText: async (key, data) => {
      try {
        const filePath = storageKeyToFilePath(normStorageDirPath, key);
        if (filePath) {
          return await run(filePath, () => writeFileAtomic(filePath, data))
        } else {
          return undefined;
        }
      } catch (err) {
        console.error(`Failed to write data storage item '${key}':`, err);
        throw err;
      }
    },
    clear: () => runFolderOperation([normStorageDirPath], () => clearStorage(normStorageDirPath)),
    getKeys: () => runFolderOperation([normStorageDirPath], () => getAllKeys(normStorageDirPath))
  }
}

export async function copyFileDataStorage(fromStorageDirPath: string, toStorageDirPath: string): Promise<boolean> {
  const normFromStorageDirPath = resolve(fromStorageDirPath);
  const normToStorageDirPath = resolve(toStorageDirPath);
  return runFolderOperation([normFromStorageDirPath, normToStorageDirPath], async () => {
    try {
      await stat(normFromStorageDirPath);
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === 'ENOENT';
    }
    try {
      await mkdir(normToStorageDirPath, { recursive: true });
      // Scratch files are not committed keys and must never enter a clone.
      await cp(normFromStorageDirPath, normToStorageDirPath, { recursive: true, filter: src => !src.endsWith(tmpSuffix) });
    } catch (err) {
      return false;
    }

    return true;
  });
}
