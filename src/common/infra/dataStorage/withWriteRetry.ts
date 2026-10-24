/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

export type WriteFailureHandler = (error: unknown, key: string) => void;

interface PendingWrite {
  text: string;
  revision: number;
  failures: number;
  inFlight: boolean;
  attempt?: Promise<boolean>;
  timer?: ReturnType<typeof setTimeout>;
  done: Promise<void>;
  resolve: () => void;
}

/** Keep failed writes in memory. Three attempts per save/flush avoid a permanent
 * retry loop; another save or flush restarts exhausted retries. A write promise
 * resolves after persistence, or after an explicit delete/clear supersedes it. */
export function withWriteRetry<T extends DataStorage>(
  storage: T,
  onError: WriteFailureHandler = (error, key) => console.error(`Could not save "${key}"; retaining pending data.`, error)
) {
  const pending = new Map<string, PendingWrite>();
  const attempt = (key: string, entry: PendingWrite): Promise<boolean> => {
    if (entry.inFlight || pending.get(key) !== entry) {
      return entry.attempt ?? Promise.resolve(false);
    }
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
    }
    entry.timer = undefined;
    entry.inFlight = true;
    const revision = entry.revision;
    const text = entry.text;
    // Call the adapter immediately: unmount flush must reach IPC before a new
    // component's read. Deferring this call by a microtask reverses that order.
    const write = async () => storage.setText(key, text);
    entry.attempt = write().then(() => {
      entry.inFlight = false;
      if (pending.get(key) !== entry) {
        return false;
      }
      if (revision !== entry.revision) {
        attempt(key, entry);
      } else {
        pending.delete(key);
        entry.resolve();
      }
      return true;
    }, error => {
      entry.inFlight = false;
      if (pending.get(key) !== entry) {
        return false;
      }
      entry.failures++;
      if (entry.failures === 1) {
        try {
          onError(error, key);
        } catch (reportError) {
          console.error('Could not report a storage failure.', reportError);
        }
      }
      if (revision !== entry.revision) {
        entry.failures = 0;
        attempt(key, entry);
      } else if (entry.failures < 3) {
        entry.timer = setTimeout(() => attempt(key, entry), 5000);
      }
      return false;
    });
    return entry.attempt;
  };
  const discard = (key: string) => {
    const entry = pending.get(key);
    if (entry) {
      if (entry.timer !== undefined) {
        clearTimeout(entry.timer);
      }
      pending.delete(key);
      entry.resolve();
    }
  };
  return {
    ...storage,
    getText: async (key: string) => pending.get(key)?.text ?? storage.getText(key),
    setText: (key: string, text: string): Promise<void> => {
      let entry = pending.get(key);
      if (entry) {
        entry.text = text;
        entry.revision++;
        entry.failures = 0;
      } else {
        let resolve!: () => void;
        const promise = new Promise<void>(done => { resolve = done; });
        entry = { text, revision: 0, failures: 0, inFlight: false, done: promise, resolve };
        pending.set(key, entry);
      }
      attempt(key, entry);
      return entry.done;
    },
    deleteItem: (key: string): Promise<void> => {
      discard(key);
      return storage.deleteItem(key);
    },
    clear: (): Promise<void> => {
      for (const key of pending.keys()) {
        discard(key);
      }
      return storage.clear();
    },
    flushWrites: () => {
      for (const [key, entry] of pending) {
        entry.failures = 0;
        attempt(key, entry);
      }
    },
    // Copy must not silently snapshot stale disk data. Await one current attempt;
    // a failed/superseded attempt aborts copying while normal retries continue.
    flushWritesOnce: async (): Promise<boolean> => {
      const results = await Promise.all([...pending].map(async ([key, entry]) => {
        entry.failures = 0;
        const saved = await attempt(key, entry);
        return saved && !pending.has(key);
      }));
      // Another key can become dirty while the captured attempts are awaited.
      return results.every(Boolean) && pending.size === 0;
    }
  };
}
