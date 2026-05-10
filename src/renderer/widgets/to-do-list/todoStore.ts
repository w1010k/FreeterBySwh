/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useSyncExternalStore } from 'react';
import { ToDoListState } from '@/widgets/to-do-list/state';
import { debounce, DebouncedFunc } from '@/widgets/helpers';

type Listener = () => void;

const states = new Map<string, ToDoListState>();
const listeners = new Map<string, Set<Listener>>();
const savers = new Map<string, DebouncedFunc<[ToDoListState]>>();

export function getTodoListState(scope: string): ToDoListState | undefined {
  return states.get(scope);
}

export function setTodoListState(scope: string, data: ToDoListState): void {
  states.set(scope, data);
  const subs = listeners.get(scope);
  if (subs) {
    for (const fn of subs) {
      fn();
    }
  }
}

function subscribeTodoListState(scope: string, fn: Listener): () => void {
  const existing = listeners.get(scope);
  const subs = existing ?? new Set<Listener>();
  if (!existing) {
    listeners.set(scope, subs);
  }
  subs.add(fn);
  return () => {
    subs.delete(fn);
    if (subs.size === 0) {
      listeners.delete(scope);
    }
  };
}

export function useTodoListState(scope: string): {
  state: ToDoListState | undefined;
  setState: (data: ToDoListState) => void;
} {
  const subscribe = useCallback(
    (onChange: Listener) => subscribeTodoListState(scope, onChange),
    [scope]
  );
  const getSnapshot = useCallback(() => states.get(scope), [scope]);
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const setState = useCallback(
    (data: ToDoListState) => setTodoListState(scope, data),
    [scope]
  );
  return { state, setState };
}

/**
 * Returns the per-scope debounced disk-saver, lazily creating it on the
 * first call for a scope. Sibling widgets in the same scope share the same
 * timer, so a quick toggle in widget A followed by another toggle in widget B
 * collapses to one disk write of the latest state — instead of two writes
 * racing each other.
 *
 * `doSave` is captured only on the first call for a scope; subsequent calls
 * return the existing saver and ignore the new callback. This is intentional:
 * all same-scope to-do widgets route through the same shared storage bucket
 * (see `getWidgetApi.ts`'s to-do-list branch), so any widget's
 * `dataStorage.setJson` closure leads to the same on-disk file.
 */
export function getOrCreateTodoListSaver(
  scope: string,
  doSave: (data: ToDoListState) => void
): DebouncedFunc<[ToDoListState]> {
  let saver = savers.get(scope);
  if (!saver) {
    saver = debounce(doSave, 500);
    savers.set(scope, saver);
  }
  return saver;
}

/** Resets in-memory state. Test helper only. */
export function resetTodoListStore(): void {
  states.clear();
  listeners.clear();
  for (const saver of savers.values()) {
    saver.cancel();
  }
  savers.clear();
}
