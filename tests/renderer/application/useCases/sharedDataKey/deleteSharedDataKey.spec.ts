/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { createDeleteSharedDataKeyUseCase } from '@/application/useCases/sharedDataKey/deleteSharedDataKey';
import { createObjectManager } from '@common/base/objectManager';
import { fixtureWidgetA, fixtureWidgetEnvAreaShelf } from '@tests/base/fixtures/widget';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureModalScreens, fixtureModalScreensData } from '@tests/base/state/fixtures/modalScreens';
import { fixtureWidgetSettings } from '@tests/base/state/fixtures/widgetSettings';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

const storage = (): jest.MockedObject<DataStorageRenderer> => ({
  clear: jest.fn(),
  getKeys: jest.fn(),
  getText: jest.fn(),
  deleteItem: jest.fn(),
  setText: jest.fn(),
  getJson: jest.fn(),
  setJson: jest.fn()
});

describe('deleteSharedDataKeyUseCase()', () => {
  it('clears the key on the widget and on the open settings draft, so OK does not restore it', async () => {
    const widget = fixtureWidgetA({ type: 'note', settings: { sharedKeyId: 'KEY' } });
    const [appStore] = await fixtureAppStore(fixtureAppState({
      entities: {
        sharedDataKeys: { KEY: { id: 'KEY', widgetType: 'note', name: 'Shared' } },
        widgets: { [widget.id]: widget },
      },
      ui: {
        modalScreens: fixtureModalScreens({
          data: fixtureModalScreensData({
            widgetSettings: fixtureWidgetSettings({
              widgetInEnv: { widget, env: fixtureWidgetEnvAreaShelf() }
            })
          })
        })
      }
    }));
    const dialog: jest.MockedObject<DialogProvider> = {
      showMessageBox: jest.fn().mockResolvedValue({ response: 0, checkboxChecked: false }),
      showOpenDirDialog: jest.fn(),
      showOpenFileDialog: jest.fn(),
      showSaveFileDialog: jest.fn(),
    };
    const useCase = createDeleteSharedDataKeyUseCase({
      appStore,
      dialog,
      sharedDataStorageManager: createObjectManager(async () => storage(), async () => true),
      widgetDataStorageManager: createObjectManager(async () => storage(), async () => true),
    });

    await useCase('KEY');

    const state = appStore.get();
    expect(state.entities.sharedDataKeys['KEY']).toBeUndefined();
    expect(state.entities.widgets[widget.id]?.settings.sharedKeyId).toBeNull();
    expect(state.ui.modalScreens.data.widgetSettings.widgetInEnv?.widget.settings.sharedKeyId).toBeNull();
  });
});
