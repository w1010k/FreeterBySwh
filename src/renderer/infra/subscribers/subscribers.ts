/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** Listeners grouped by an id (a terminal, a conversation), for one app-wide IPC listener to hand messages to. */
export function createSubscribers<T>() {
  const subs = new Map<string, Set<(v: T) => void>>();
  return {
    /** Returns the unsubscribe function. */
    add(id: string, fn: (v: T) => void): () => void {
      const set = subs.get(id) ?? new Set();
      subs.set(id, set);
      set.add(fn);
      return () => {
        set.delete(fn);
        // Only its own set: a later subscriber of this id may have a new one.
        if (set.size === 0 && subs.get(id) === set) {
          subs.delete(id);
        }
      };
    },
    has(id: string): boolean {
      return subs.has(id);
    },
    emit(id: string, v: T): void {
      subs.get(id)?.forEach(fn => fn(v));
    },
  };
}
