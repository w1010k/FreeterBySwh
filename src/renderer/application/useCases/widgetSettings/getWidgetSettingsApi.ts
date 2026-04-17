/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetSettingsApi } from '@/base/widgetApi';
import { AppStore } from '@/application/interfaces/store';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { entityStateActions, modalScreensStateActions } from '@/base/state/actions';
import { WidgetSettings } from '@/base/widget';
import { OpenAppManagerUseCase } from '@/application/useCases/appManager/openAppManager';
import { IdGenerator } from '@/application/interfaces/idGenerator';
import { DeleteSharedDataKeyUseCase } from '@/application/useCases/sharedDataKey/deleteSharedDataKey';

interface Deps {
  appStore: AppStore;
  dialogProvider: DialogProvider;
  openAppManagerUseCase: OpenAppManagerUseCase;
  idGenerator: IdGenerator;
  deleteSharedDataKeyUseCase: DeleteSharedDataKeyUseCase;
}

export function createGetWidgetSettingsApiUseCase({
  appStore,
  dialogProvider,
  openAppManagerUseCase,
  idGenerator,
  deleteSharedDataKeyUseCase,
}: Deps) {
  function getWidgetSettingsApiUseCase() {
    const settingsApi: WidgetSettingsApi<WidgetSettings> = {
      updateSettings: (settings: WidgetSettings) => {
        const state = appStore.get();
        const { widgetInEnv } = state.ui.modalScreens.data.widgetSettings;
        if (!widgetInEnv) {
          return;
        }
        appStore.set(modalScreensStateActions.updateModalScreen(state, 'widgetSettings', {
          widgetInEnv: {
            ...widgetInEnv,
            widget: {
              ...widgetInEnv.widget,
              settings: {
                ...widgetInEnv.widget.settings,
                ...settings
              }
            }
          }
        }));
      },
      dialog: {
        showAppManager: () => openAppManagerUseCase(),
        showOpenDirDialog: cfg => dialogProvider.showOpenDirDialog(cfg),
        showOpenFileDialog: cfg => dialogProvider.showOpenFileDialog(cfg),
      },
      sharedDataKey: {
        create: (widgetType, name) => {
          const id = idGenerator();
          const state = appStore.get();
          appStore.set(entityStateActions.sharedDataKeys.addOne(state, {
            id,
            widgetType,
            name,
          }));
          return id;
        },
        delete: (keyId) => deleteSharedDataKeyUseCase(keyId),
      }
    }
    return settingsApi;
  }

  return getWidgetSettingsApiUseCase;
}

export type GetWidgetSettingsApiUseCase = ReturnType<typeof createGetWidgetSettingsApiUseCase>;
