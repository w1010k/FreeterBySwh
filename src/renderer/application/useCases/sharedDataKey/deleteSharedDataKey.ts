/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { AppStore } from '@/application/interfaces/store';
import { EntityId } from '@/base/entity';
import { entityStateActions } from '@/base/state/actions';
import { getEntitiesArrayFromEntityCollection } from '@/base/entityCollection';
import { resolveWidgetSharedKeyId } from '@/base/widget';
import { ObjectManager } from '@common/base/objectManager';
import { sharedStorageId } from '@common/base/sharedStorageId';

type Deps = {
  appStore: AppStore;
  dialog: DialogProvider;
  sharedDataStorageManager: ObjectManager<DataStorageRenderer>;
  widgetDataStorageManager: ObjectManager<DataStorageRenderer>;
}

export function createDeleteSharedDataKeyUseCase({
  appStore,
  dialog,
  sharedDataStorageManager,
  widgetDataStorageManager,
}: Deps) {
  return async function deleteSharedDataKeyUseCase(keyId: EntityId) {
    const initialState = appStore.get();
    const key = initialState.entities.sharedDataKeys[keyId];
    if (!key) {
      return;
    }

    const affectedWidgets = getEntitiesArrayFromEntityCollection(initialState.entities.widgets)
      .filter(w => resolveWidgetSharedKeyId(w) === keyId);

    const res = await dialog.showMessageBox({
      message: `Delete the shared key "${key.name}"? This also erases the shared content and clears ${affectedWidgets.length} widget(s) using it.`,
      buttons: ['Delete', 'Cancel'],
      cancelId: 1,
      defaultId: 1,
      type: 'warning',
    });
    if (res.response !== 0) {
      return;
    }

    // Wipe storage. Fire-and-forget is fine: the state update below removes
    // all references, so even if a write is in flight it lands in a now-orphan
    // directory that no widget reads from.
    sharedDataStorageManager.getObject(sharedStorageId(key.widgetType, keyId))
      .then(s => s.clear());
    for (const w of affectedWidgets) {
      widgetDataStorageManager.getObject(w.id).then(s => s.clear());
    }

    // Re-read state in case anything changed during the dialog await.
    let next = appStore.get();
    next = entityStateActions.sharedDataKeys.removeOne(next, keyId);
    for (const w of affectedWidgets) {
      const current = next.entities.widgets[w.id];
      if (!current) {
        continue;
      }
      next = entityStateActions.widgets.updateOne(next, {
        id: w.id,
        changes: {
          settings: { ...current.settings, sharedKeyId: null },
        },
      });
    }
    appStore.set(next);
  }
}

export type DeleteSharedDataKeyUseCase = ReturnType<typeof createDeleteSharedDataKeyUseCase>;
