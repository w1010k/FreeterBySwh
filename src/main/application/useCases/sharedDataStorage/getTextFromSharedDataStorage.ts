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

export function createGetTextFromSharedDataStorageUseCase({ sharedDataStorageManager }: Deps) {
  return async function getTextFromSharedDataStorageUseCase(widgetType: string, sharedKeyId: string, key: string): Promise<string | undefined> {
    const storage = await sharedDataStorageManager.getObject(sharedStorageId(widgetType, sharedKeyId));
    return storage.getText(key);
  }
}

export type GetTextFromSharedDataStorageUseCase = ReturnType<typeof createGetTextFromSharedDataStorageUseCase>;
