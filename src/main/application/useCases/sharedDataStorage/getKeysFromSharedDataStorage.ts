/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';
import { ObjectManager } from '@common/base/objectManager';
import { sharedStorageId } from '@common/base/sharedStorageId';

interface Deps {
  sharedDataStorageManager: ObjectManager<DataStorage>;
}

export function createGetKeysFromSharedDataStorageUseCase({ sharedDataStorageManager }: Deps) {
  return async function getKeysFromSharedDataStorageUseCase(widgetType: string, sharedKeyId: string): Promise<string[]> {
    const storage = await sharedDataStorageManager.getObject(sharedStorageId(widgetType, sharedKeyId));
    return storage.getKeys();
  }
}

export type GetKeysFromSharedDataStorageUseCase = ReturnType<typeof createGetKeysFromSharedDataStorageUseCase>;
