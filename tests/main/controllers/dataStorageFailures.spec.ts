/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';
import { createObjectManager } from '@common/base/objectManager';
import { createSetTextInAppDataStorageUseCase } from '@/application/useCases/appDataStorage/setTextInAppDataStorage';
import { createSetTextInWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/setTextInWidgetDataStorage';
import { createSetTextInSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/setTextInSharedDataStorage';
import { createSetTextInTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/setTextInTelemetryDataStorage';
import { createAppDataStorageControllers } from '@/controllers/appDataStorage';
import { createWidgetDataStorageControllers } from '@/controllers/widgetDataStorage';
import { createSharedDataStorageControllers } from '@/controllers/sharedDataStorage';
import { createTelemetryDataStorageControllers } from '@/controllers/telemetryDataStorage';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

let dirPath: string;

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), 'freeter-storage-ipc-'));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await rm(dirPath, { recursive: true, force: true });
});

describe('data storage controller write failures', () => {
  it.each(['app', 'widget', 'shared', 'telemetry'] as const)('should propagate a real %s storage failure without broadcasting success', async kind => {
    const storage = await createFileDataStorage('string', dirPath);
    await storage.setText('state', 'original');
    const manager = createObjectManager(async () => storage, async () => true);
    const sendToAppWindow = jest.fn();
    const event = fixtureIpcMainEvent();
    const appController = createAppDataStorageControllers({
      getTextFromAppDataStorageUseCase: storage.getText,
      setTextInAppDataStorageUseCase: createSetTextInAppDataStorageUseCase({ appDataStorage: storage }),
    })[1];
    const widgetController = createWidgetDataStorageControllers({
      getTextFromWidgetDataStorageUseCase: async (_id, key) => storage.getText(key),
      setTextInWidgetDataStorageUseCase: createSetTextInWidgetDataStorageUseCase({ widgetDataStorageManager: manager }),
      deleteInWidgetDataStorageUseCase: async (_id, key) => storage.deleteItem(key),
      clearWidgetDataStorageUseCase: storage.clear,
      getKeysFromWidgetDataStorageUseCase: storage.getKeys,
      copyWidgetDataStorageUseCase: manager.copyObjectData,
    })[1];
    const sharedController = createSharedDataStorageControllers({
      getTextFromSharedDataStorageUseCase: async (_type, _id, key) => storage.getText(key),
      setTextInSharedDataStorageUseCase: createSetTextInSharedDataStorageUseCase({ sharedDataStorageManager: manager }),
      deleteInSharedDataStorageUseCase: async (_type, _id, key) => storage.deleteItem(key),
      clearSharedDataStorageUseCase: storage.clear,
      getKeysFromSharedDataStorageUseCase: storage.getKeys,
      sendToAppWindow,
    })[1];
    const telemetryController = createTelemetryDataStorageControllers({
      getTextFromTelemetryDataStorageUseCase: storage.getText,
      setTextInTelemetryDataStorageUseCase: createSetTextInTelemetryDataStorageUseCase({ telemetryDataStorage: storage }),
      deleteInTelemetryDataStorageUseCase: storage.deleteItem,
      clearTelemetryDataStorageUseCase: storage.clear,
      getKeysFromTelemetryDataStorageUseCase: storage.getKeys,
    })[1];
    const calls = {
      app: () => appController.handle(event, 'state', 'replacement'),
      widget: () => widgetController.handle(event, 'id', 'state', 'replacement'),
      shared: () => sharedController.handle(event, 'note', 'id', 'state', 'replacement'),
      telemetry: () => telemetryController.handle(event, 'state', 'replacement'),
    };
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const error = Object.assign(new Error('full disk'), { code: 'ENOSPC' });
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(error);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(calls[kind]()).rejects.toBe(error);

    expect(await storage.getText('state')).toBe('original');
    expect(sendToAppWindow).not.toHaveBeenCalled();
  });
});
