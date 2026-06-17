/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClearTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/clearTelemetryDataStorage';
import { DeleteInTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/deleteInTelemetryDataStorage';
import { GetKeysFromTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/getKeysFromTelemetryDataStorage';
import { GetTextFromTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/getTextFromTelemetryDataStorage';
import { SetTextInTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/setTextInTelemetryDataStorage';
import { Controller } from '@/controllers/controller';
import { IpcTelemetryDataStorageClearArgs, ipcTelemetryDataStorageClearChannel, IpcTelemetryDataStorageClearRes, IpcTelemetryDataStorageDeleteArgs, ipcTelemetryDataStorageDeleteChannel, IpcTelemetryDataStorageDeleteRes, IpcTelemetryDataStorageGetKeysArgs, ipcTelemetryDataStorageGetKeysChannel, IpcTelemetryDataStorageGetKeysRes, IpcTelemetryDataStorageGetTextArgs, ipcTelemetryDataStorageGetTextChannel, IpcTelemetryDataStorageGetTextRes, IpcTelemetryDataStorageSetTextArgs, ipcTelemetryDataStorageSetTextChannel, IpcTelemetryDataStorageSetTextRes } from '@common/ipc/channels';

type Deps = {
  getTextFromTelemetryDataStorageUseCase: GetTextFromTelemetryDataStorageUseCase;
  setTextInTelemetryDataStorageUseCase: SetTextInTelemetryDataStorageUseCase;
  deleteInTelemetryDataStorageUseCase: DeleteInTelemetryDataStorageUseCase;
  clearTelemetryDataStorageUseCase: ClearTelemetryDataStorageUseCase;
  getKeysFromTelemetryDataStorageUseCase: GetKeysFromTelemetryDataStorageUseCase;
}

export function createTelemetryDataStorageControllers({
  getTextFromTelemetryDataStorageUseCase,
  setTextInTelemetryDataStorageUseCase,
  deleteInTelemetryDataStorageUseCase,
  clearTelemetryDataStorageUseCase,
  getKeysFromTelemetryDataStorageUseCase,
}: Deps): [
    Controller<IpcTelemetryDataStorageGetTextArgs, IpcTelemetryDataStorageGetTextRes>,
    Controller<IpcTelemetryDataStorageSetTextArgs, IpcTelemetryDataStorageSetTextRes>,
    Controller<IpcTelemetryDataStorageDeleteArgs, IpcTelemetryDataStorageDeleteRes>,
    Controller<IpcTelemetryDataStorageClearArgs, IpcTelemetryDataStorageClearRes>,
    Controller<IpcTelemetryDataStorageGetKeysArgs, IpcTelemetryDataStorageGetKeysRes>
  ] {
  return [{
    channel: ipcTelemetryDataStorageGetTextChannel,
    handle: async (_event, key) => getTextFromTelemetryDataStorageUseCase(key)
  }, {
    channel: ipcTelemetryDataStorageSetTextChannel,
    handle: async (_event, key, text) => setTextInTelemetryDataStorageUseCase(key, text)
  }, {
    channel: ipcTelemetryDataStorageDeleteChannel,
    handle: async (_event, key) => deleteInTelemetryDataStorageUseCase(key)
  }, {
    channel: ipcTelemetryDataStorageClearChannel,
    handle: async (_event) => clearTelemetryDataStorageUseCase()
  }, {
    channel: ipcTelemetryDataStorageGetKeysChannel,
    handle: async (_event) => getKeysFromTelemetryDataStorageUseCase()
  }]
}
