/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createVersionedObject, isVersionedObject, MigrateVersionedObject, unwrapVersionedObject } from '@common/base/versionedObject';
import { debounce } from '@common/helpers/debounce';
import { DataStorage } from '@common/application/interfaces/dataStorage';
import { withWriteRetry } from '@common/infra/dataStorage/withWriteRetry';

export type StateStorageErrorHandler = (phase: 'load' | 'save', error: unknown) => void;

export const appStateDataStoragKey = 'app';
export const windowStateDataStoragKey = 'window';

export interface StateStorage<TState extends object, TPersistentState extends object> {
  loadState(): Promise<TPersistentState | null>;
  saveState(state: TState): void;
  /** Immediately persist a pending debounced save (if any). Used to avoid losing the last change on quit. */
  flush(): void;
}

export function createStateStorage<TState extends object, TPersistentState extends object>(
  dataStorage: DataStorage,
  stateDataStoragKey: string,
  version: number,
  debounceMsec: number,
  migrate: MigrateVersionedObject<object, TPersistentState>,
  persistentStateFactory: (state: TState) => TPersistentState,
  /**
   * Optional shape guard for the unwrapped (post-migration) persistent state.
   * When it returns false — or when the text is not JSON, or migrate/unwrap
   * throws on corrupt data — the stored text is copied aside (see
   * `backUpUnloadableText`) and `loadState` resolves to null, so the store
   * falls back to defaults instead of hydrating from a broken object.
   */
  validatePersistentState?: (state: TPersistentState) => boolean,
  onError?: StateStorageErrorHandler
): StateStorage<TState, TPersistentState> {
  let lastJson: string | undefined;
  let loadFailed = false;
  const reported = new Set<'load' | 'save'>();
  const report = (phase: 'load' | 'save', error: unknown) => {
    console.error(`Persisted state "${stateDataStoragKey}" ${phase} failed.`, error);
    if (!reported.has(phase)) {
      reported.add(phase);
      try {
        onError?.(phase, error);
      } catch (reportError) {
        console.error('Could not report a storage failure.', reportError);
      }
    }
  };
  const retryStorage = withWriteRetry(dataStorage, error => report('save', error));
  const writeJson = (json: string) => {
    void retryStorage.setText(stateDataStoragKey, json);
  };
  const debouncedWriteJson = debounceMsec > 0 ? debounce(writeJson, debounceMsec) : undefined;

  // This includes a queued value: runtime-only changes must not postpone its
  // debounce forever or restart exhausted retries. Failed writes stay pending
  // in retryStorage; flush or a changed persistent value can retry them.

  // The defaults the store falls back to get saved over the stored file on the
  // first change, so keep the unloadable original for manual recovery. An empty
  // file (truncated) holds nothing to recover.
  const backUpUnloadableText = async (text: string) => {
    if (text.trim() !== '') {
      await dataStorage.setText(`${stateDataStoragKey}-corrupt-${Date.now()}`, text);
    }
  }

  const loadState = async () => {
    const text = await dataStorage.getText(stateDataStoragKey);
    if (text === undefined) {
      return null;
    }
    try {
      const gotData: unknown = JSON.parse(text);
      if (typeof gotData === 'object' && gotData !== null && isVersionedObject(gotData)) {
        const state = unwrapVersionedObject(gotData, version, migrate);
        if (!validatePersistentState || validatePersistentState(state)) {
          return state;
        }
      }
      console.warn(`Persisted state "${stateDataStoragKey}" is not a versioned object or failed validation; falling back to defaults.`);
    } catch (err) {
      console.warn(`Could not load persisted state "${stateDataStoragKey}"; falling back to defaults.`, err);
    }
    await backUpUnloadableText(text);
    return null;
  };
  return {
    async loadState() {
      try {
        const state = await loadState();
        loadFailed = false;
        return state;
      } catch (error) {
        // Defaults can still be displayed, but must never overwrite unreadable
        // data or an original whose recovery backup could not be written.
        loadFailed = true;
        report('load', error);
        throw error;
      }
    },
    saveState: (state: TState) => {
      if (loadFailed) {
        return;
      }
      const json = JSON.stringify(createVersionedObject(persistentStateFactory(state), version));
      if (json === lastJson) {
        return;
      }
      lastJson = json;
      (debouncedWriteJson ?? writeJson)(json);
    },
    flush: () => {
      if (!loadFailed) {
        debouncedWriteJson?.flush();
        retryStorage.flushWrites();
      }
    }
  }
}
