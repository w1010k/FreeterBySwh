/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { StateInStore, Store } from '@common/application/interfaces/store';
import { StateStorage } from '@common/data/stateStorage';
import { createStore as zustandCreateStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/vanilla/shallow';

export function createStore<TState extends object, TPersistentState extends object>(
  deps: {
    stateStorage: StateStorage<TState, TPersistentState>;
  },
  initialState: TState,
  prepareState: (state: StateInStore<TState>) => StateInStore<TState>,
  mergeState: (state: TState, persistentState: TPersistentState) => TState,
  onStoreReady?: () => void
) {
  const { stateStorage } = deps;

  const zustandStore = zustandCreateStore(
    subscribeWithSelector(
      () => prepareState({ ...initialState, isLoading: true })
    )
  );
  const { getState, setState, subscribe } = zustandStore;

  let isLoaded = false;
  const finishLoad = (state: TState) => {
    setState(prepareState(state), true);
    isLoaded = true;
    if (onStoreReady) {
      onStoreReady();
    }
  }
  stateStorage.loadState()
    .then(loadedState => {
      finishLoad(loadedState !== null ? mergeState(initialState, loadedState) : initialState);
    })
    .catch(err => {
      // Don't let a failed load leave the store stuck in isLoading forever — start
      // with defaults so the UI can mount. (getJson normally swallows I/O errors,
      // so this is a defensive safety net for unexpected rejections.)
      console.error('Failed to load persisted state; starting with defaults.', err);
      finishLoad(initialState);
    })

  const store: Store<TState> = {
    get: getState,
    set: state => {
      if (isLoaded) {
        const prevState = getState();
        setState(state);
        const nextState = getState();
        // Skip the save (and its debounce-timer reset) when the set was a no-op.
        // High-frequency callers (e.g. dragOver) can re-set an unchanged state;
        // zustand already short-circuits subscriber notifications, this avoids
        // churning the persistence timer too.
        if (!shallow(prevState, nextState)) {
          stateStorage.saveState(nextState);
        }
      }
    },
    flush: () => stateStorage.flush(),
    subscribe: (selector, listener, options) => subscribe(selector, listener, { ...options, equalityFn: shallow }),
    subscribeWithStrictEq: subscribe,
    subscribeWithCustomEq: subscribe
  }

  return [
    store,
    zustandStore
  ] as const;
}

