/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';
import { IpcTelemetryDataStorageClearArgs, ipcTelemetryDataStorageClearChannel, IpcTelemetryDataStorageClearRes, IpcTelemetryDataStorageDeleteArgs, ipcTelemetryDataStorageDeleteChannel, IpcTelemetryDataStorageDeleteRes, IpcTelemetryDataStorageGetKeysArgs, ipcTelemetryDataStorageGetKeysChannel, IpcTelemetryDataStorageGetKeysRes, IpcTelemetryDataStorageGetTextArgs, ipcTelemetryDataStorageGetTextChannel, IpcTelemetryDataStorageGetTextRes, IpcTelemetryDataStorageSetTextArgs, ipcTelemetryDataStorageSetTextChannel, IpcTelemetryDataStorageSetTextRes } from '@common/ipc/channels';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

export function createTelemetryDataStorage(): DataStorage {
  return {
    getText: async (key) => electronIpcRenderer.invoke<IpcTelemetryDataStorageGetTextArgs, IpcTelemetryDataStorageGetTextRes>
      (
        ipcTelemetryDataStorageGetTextChannel,
        key
      ),
    setText: async (key, text) => electronIpcRenderer.invoke<IpcTelemetryDataStorageSetTextArgs, IpcTelemetryDataStorageSetTextRes>
      (
        ipcTelemetryDataStorageSetTextChannel,
        key,
        text
      ),
    deleteItem: async (key) => electronIpcRenderer.invoke<IpcTelemetryDataStorageDeleteArgs, IpcTelemetryDataStorageDeleteRes>
      (
        ipcTelemetryDataStorageDeleteChannel,
        key
      ),
    clear: async () => electronIpcRenderer.invoke<IpcTelemetryDataStorageClearArgs, IpcTelemetryDataStorageClearRes>
      (
        ipcTelemetryDataStorageClearChannel
      ),
    getKeys: async () => electronIpcRenderer.invoke<IpcTelemetryDataStorageGetKeysArgs, IpcTelemetryDataStorageGetKeysRes>
      (
        ipcTelemetryDataStorageGetKeysChannel
      )
  }
}
