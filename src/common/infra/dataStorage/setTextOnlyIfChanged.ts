/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

export function setTextOnlyIfChanged<T extends DataStorage>(dataStorage: T): T {
  const previous = new Map<string, string | undefined>();
  const revisions = new Map<string, object>();
  const reads = new Map<string, object>();
  const writes = new Map<string, number>();
  let epoch = 0;
  const invalidate = (key: string) => {
    const revision = {};
    revisions.set(key, revision);
    previous.delete(key);
    return revision;
  };
  return {
    ...dataStorage,
    getText: async (key) => {
      const revision = revisions.get(key);
      const read = {};
      const readEpoch = epoch;
      const writing = (writes.get(key) ?? 0) > 0;
      reads.set(key, read);
      const item = await dataStorage.getText(key);
      // A stale read must not make a later real write look redundant.
      if (!writing && !writes.get(key) && epoch === readEpoch && revisions.get(key) === revision && reads.get(key) === read) {
        previous.set(key, item);
      }
      return item;
    },
    setText: async (key, text) => {
      if (previous.has(key) && previous.get(key) === text) {
        return;
      }
      const revision = invalidate(key);
      const writeEpoch = epoch;
      writes.set(key, (writes.get(key) ?? 0) + 1);
      try {
        await dataStorage.setText(key, text);
        if (epoch === writeEpoch && revisions.get(key) === revision) {
          previous.set(key, text);
        }
      } finally {
        const remaining = (writes.get(key) ?? 1) - 1;
        if (remaining > 0) {
          writes.set(key, remaining);
        } else {
          writes.delete(key);
        }
      }
    },
    deleteItem: async (key) => {
      invalidate(key);
      return dataStorage.deleteItem(key);
    },
    clear: async () => {
      epoch++;
      previous.clear();
      revisions.clear();
      reads.clear();
      return dataStorage.clear();
    }
  }
}
