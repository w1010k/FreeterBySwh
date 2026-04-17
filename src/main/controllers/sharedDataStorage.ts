/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClearSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/clearSharedDataStorage';
import { DeleteInSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/deleteInSharedDataStorage';
import { GetKeysFromSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/getKeysFromSharedDataStorage';
import { GetTextFromSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/getTextFromSharedDataStorage';
import { SetTextInSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/setTextInSharedDataStorage';
import { Controller } from '@/controllers/controller';
import {
  IpcSharedDataClearArgs, ipcSharedDataClearChannel, IpcSharedDataClearRes,
  IpcSharedDataDeleteArgs, ipcSharedDataDeleteChannel, IpcSharedDataDeleteRes,
  IpcSharedDataGetKeysArgs, ipcSharedDataGetKeysChannel, IpcSharedDataGetKeysRes,
  IpcSharedDataGetTextArgs, ipcSharedDataGetTextChannel, IpcSharedDataGetTextRes,
  IpcSharedDataSetTextArgs, ipcSharedDataSetTextChannel, IpcSharedDataSetTextRes,
  ipcSharedDataChangedChannel,
} from '@common/ipc/channels';
import { BrowserWindow } from 'electron';

function broadcastChanged(widgetType: string, sharedKeyId: string) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(ipcSharedDataChangedChannel, widgetType, sharedKeyId);
    }
  }
}

type Deps = {
  getTextFromSharedDataStorageUseCase: GetTextFromSharedDataStorageUseCase;
  setTextInSharedDataStorageUseCase: SetTextInSharedDataStorageUseCase;
  deleteInSharedDataStorageUseCase: DeleteInSharedDataStorageUseCase;
  clearSharedDataStorageUseCase: ClearSharedDataStorageUseCase;
  getKeysFromSharedDataStorageUseCase: GetKeysFromSharedDataStorageUseCase;
}

export function createSharedDataStorageControllers({
  getTextFromSharedDataStorageUseCase,
  setTextInSharedDataStorageUseCase,
  deleteInSharedDataStorageUseCase,
  clearSharedDataStorageUseCase,
  getKeysFromSharedDataStorageUseCase,
}: Deps): [
    Controller<IpcSharedDataGetTextArgs, IpcSharedDataGetTextRes>,
    Controller<IpcSharedDataSetTextArgs, IpcSharedDataSetTextRes>,
    Controller<IpcSharedDataDeleteArgs, IpcSharedDataDeleteRes>,
    Controller<IpcSharedDataClearArgs, IpcSharedDataClearRes>,
    Controller<IpcSharedDataGetKeysArgs, IpcSharedDataGetKeysRes>,
  ] {
  return [{
    channel: ipcSharedDataGetTextChannel,
    handle: async (_event, widgetType, sharedKeyId, key) => getTextFromSharedDataStorageUseCase(widgetType, sharedKeyId, key)
  }, {
    channel: ipcSharedDataSetTextChannel,
    handle: async (_event, widgetType, sharedKeyId, key, text) => {
      await setTextInSharedDataStorageUseCase(widgetType, sharedKeyId, key, text);
      broadcastChanged(widgetType, sharedKeyId);
    }
  }, {
    channel: ipcSharedDataDeleteChannel,
    handle: async (_event, widgetType, sharedKeyId, key) => {
      await deleteInSharedDataStorageUseCase(widgetType, sharedKeyId, key);
      broadcastChanged(widgetType, sharedKeyId);
    }
  }, {
    channel: ipcSharedDataClearChannel,
    handle: async (_event, widgetType, sharedKeyId) => {
      await clearSharedDataStorageUseCase(widgetType, sharedKeyId);
      broadcastChanged(widgetType, sharedKeyId);
    }
  }, {
    channel: ipcSharedDataGetKeysChannel,
    handle: async (_event, widgetType, sharedKeyId) => getKeysFromSharedDataStorageUseCase(widgetType, sharedKeyId)
  }]
}
