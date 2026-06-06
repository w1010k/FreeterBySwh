/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CloseApplicationSettingsUseCase } from '@/application/useCases/applicationSettings/closeApplicationSettings';
import { GetMainHotkeyOptionsUseCase } from '@/application/useCases/applicationSettings/getMainHotkeyOptions';
import { SaveApplicationSettingsUseCase } from '@/application/useCases/applicationSettings/saveApplicationSettings';
import { UpdateApplicationSettingsUseCase } from '@/application/useCases/applicationSettings/updateApplicationSettings';
import { AppConfig } from '@/base/appConfig';
import { memSaverConfigAppActivateOnProjectSwitchOptions, memSaverConfigAppInactiveAfterOptions } from '@/base/memSaver';
import { uiThemes } from '@/base/uiTheme';
import { UseAppState } from '@/ui/hooks/appState';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { useCallback } from 'react';

type Deps = {
  useAppState: UseAppState;
  getMainHotkeyOptionsUseCase: GetMainHotkeyOptionsUseCase;
  saveApplicationSettingsUseCase: SaveApplicationSettingsUseCase;
  updateApplicationSettingsUseCase: UpdateApplicationSettingsUseCase;
  closeApplicationSettingsUseCase: CloseApplicationSettingsUseCase;
  dialogProvider: DialogProvider;
}

export function createApplicationSettingsViewModelHook({
  useAppState,
  getMainHotkeyOptionsUseCase,
  saveApplicationSettingsUseCase,
  updateApplicationSettingsUseCase,
  closeApplicationSettingsUseCase,
  dialogProvider,
}: Deps) {
  const hotkeyOptions = getMainHotkeyOptionsUseCase();
  const uiThemeOptions = uiThemes;
  const inactiveAfterOptions = memSaverConfigAppInactiveAfterOptions;
  const activateOnProjectSwitchOptions = memSaverConfigAppActivateOnProjectSwitchOptions;

  function useViewModel() {
    const {
      appConfig,
    } = useAppState(state => ({
      appConfig: state.ui.modalScreens.data.applicationSettings.appConfig
    }))

    const updateSettings = useCallback((newAppConfig: AppConfig) => {
      updateApplicationSettingsUseCase(newAppConfig);
    }, [])

    const onBrowseDownloadDirHandler = useCallback(async () => {
      if (!appConfig) {
        return;
      }
      const res = await dialogProvider.showOpenDirDialog({});
      if (!res.canceled && res.filePaths[0]) {
        updateSettings({ ...appConfig, downloadDir: res.filePaths[0] });
      }
    }, [appConfig, updateSettings])

    const onResetDownloadDirHandler = useCallback(() => {
      if (appConfig) {
        updateSettings({ ...appConfig, downloadDir: '' });
      }
    }, [appConfig, updateSettings])

    const onBrowseBgImageHandler = useCallback(async () => {
      if (!appConfig) {
        return;
      }
      const res = await dialogProvider.showOpenFileDialog({
        title: 'Choose workflow background image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
      });
      if (!res.canceled && res.filePaths[0]) {
        updateSettings({ ...appConfig, bgImage: res.filePaths[0] });
      }
    }, [appConfig, updateSettings])

    const onClearBgImageHandler = useCallback(() => {
      if (appConfig) {
        updateSettings({ ...appConfig, bgImage: '' });
      }
    }, [appConfig, updateSettings])

    const onOkClickHandler = useCallback(() => {
      saveApplicationSettingsUseCase();
    }, []);

    const onCancelClickHandler = useCallback(() => {
      closeApplicationSettingsUseCase();
    }, []);

    return {
      appConfig,
      hotkeyOptions,
      updateSettings,
      onBrowseDownloadDirHandler,
      onResetDownloadDirHandler,
      onBrowseBgImageHandler,
      onClearBgImageHandler,
      onOkClickHandler,
      onCancelClickHandler,
      uiThemeOptions,
      inactiveAfterOptions,
      activateOnProjectSwitchOptions
    }
  }

  return useViewModel;
}

export type ApplicationSettingsViewModelHook = ReturnType<typeof createApplicationSettingsViewModelHook>;
export type ApplicationSettingsViewModel = ReturnType<ApplicationSettingsViewModelHook>;
