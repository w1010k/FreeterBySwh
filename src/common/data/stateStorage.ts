/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createVersionedObject, isVersionedObject, MigrateVersionedObject, unwrapVersionedObject } from '@common/base/versionedObject';
import { debounce } from '@common/helpers/debounce';
import { DataStorageJson } from '@common/application/interfaces/dataStorage';

export const appStateDataStoragKey = 'app';
export const windowStateDataStoragKey = 'window';

export interface StateStorage<TState extends object, TPersistentState extends object> {
  loadState(): Promise<TPersistentState | null>;
  saveState(state: TState): void;
  /** Immediately persist a pending debounced save (if any). Used to avoid losing the last change on quit. */
  flush(): void;
}

export function createStateStorage<TState extends object, TPersistentState extends object>(
  dataStorage: DataStorageJson,
  stateDataStoragKey: string,
  version: number,
  debounceMsec: number,
  migrate: MigrateVersionedObject<object, TPersistentState>,
  persistentStateFactory: (state: TState) => TPersistentState,
  /**
   * Optional shape guard for the unwrapped (post-migration) persistent state.
   * When it returns false — or when migrate/unwrap throws on corrupt data — the
   * stored state is discarded and `loadState` resolves to null, so the store
   * falls back to defaults instead of hydrating from a broken object.
   */
  validatePersistentState?: (state: TPersistentState) => boolean
): StateStorage<TState, TPersistentState> {
  const saveState = (state: TState) => {
    dataStorage.setJson(stateDataStoragKey, createVersionedObject(persistentStateFactory(state), version));
  }
  const debouncedSaveState = debounceMsec > 0 ? debounce(saveState, debounceMsec) : undefined;
  return {
    async loadState() {
      const gotData = await dataStorage.getJson(stateDataStoragKey);
      if (!gotData || !isVersionedObject(gotData)) {
        return null;
      }
      try {
        const state = unwrapVersionedObject(gotData, version, migrate);
        if (validatePersistentState && !validatePersistentState(state)) {
          console.warn(`Persisted state "${stateDataStoragKey}" failed validation; falling back to defaults.`);
          return null;
        }
        return state;
      } catch (err) {
        console.warn(`Could not load persisted state "${stateDataStoragKey}"; falling back to defaults.`, err);
        return null;
      }
    },
    saveState: debouncedSaveState ?? saveState,
    flush: () => debouncedSaveState?.flush()
  }
}
