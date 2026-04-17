/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  IpcSharedDataClearArgs, ipcSharedDataClearChannel, IpcSharedDataClearRes,
  IpcSharedDataDeleteArgs, ipcSharedDataDeleteChannel, IpcSharedDataDeleteRes,
  IpcSharedDataGetKeysArgs, ipcSharedDataGetKeysChannel, IpcSharedDataGetKeysRes,
  IpcSharedDataGetTextArgs, ipcSharedDataGetTextChannel, IpcSharedDataGetTextRes,
  IpcSharedDataSetTextArgs, ipcSharedDataSetTextChannel, IpcSharedDataSetTextRes,
} from '@common/ipc/channels';
import { DataStorage } from '@common/application/interfaces/dataStorage';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

export function createSharedDataStorage(widgetType: string, sharedKeyId: string): DataStorage {
  return {
    getText: async (key) => electronIpcRenderer.invoke<IpcSharedDataGetTextArgs, IpcSharedDataGetTextRes>(
      ipcSharedDataGetTextChannel,
      widgetType,
      sharedKeyId,
      key
    ),
    setText: async (key, text) => electronIpcRenderer.invoke<IpcSharedDataSetTextArgs, IpcSharedDataSetTextRes>(
      ipcSharedDataSetTextChannel,
      widgetType,
      sharedKeyId,
      key,
      text
    ),
    deleteItem: async (key) => electronIpcRenderer.invoke<IpcSharedDataDeleteArgs, IpcSharedDataDeleteRes>(
      ipcSharedDataDeleteChannel,
      widgetType,
      sharedKeyId,
      key
    ),
    clear: async () => electronIpcRenderer.invoke<IpcSharedDataClearArgs, IpcSharedDataClearRes>(
      ipcSharedDataClearChannel,
      widgetType,
      sharedKeyId
    ),
    getKeys: async () => electronIpcRenderer.invoke<IpcSharedDataGetKeysArgs, IpcSharedDataGetKeysRes>(
      ipcSharedDataGetKeysChannel,
      widgetType,
      sharedKeyId
    ),
  }
}
