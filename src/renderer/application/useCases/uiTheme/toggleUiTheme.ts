/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { resolveUiThemeId, toggledUiThemeId } from '@/base/uiTheme';

type Deps = {
  appStore: AppStore;
}

/**
 * Switches between a light and a dark theme: to the theme's pair, else to Light or Dark. The next toggle goes back to
 * the setting it left (One Dark -> Light -> One Dark, System -> Light -> System), unless the theme changed another way
 * in between (Settings, AI) or going back would show the same theme (System after the OS mode changed).
 */
export function createToggleUiThemeUseCase({
  appStore
}: Deps) {
  // In memory only: after a restart the toggle starts from the saved theme.
  let lastToggle: { from: string; to: string } | null = null;

  // A theme change that is not this toggle's own forgets the way back.
  appStore.subscribe(state => state.ui.appConfig.uiTheme, uiTheme => {
    if (lastToggle && uiTheme !== lastToggle.to) {
      lastToggle = null;
    }
  });

  const useCase = () => {
    const state = appStore.get();
    const { appConfig, systemThemeKind, modalScreens } = state.ui;
    const shown = resolveUiThemeId(appConfig.uiTheme, systemThemeKind);
    let next: string;
    if (lastToggle && lastToggle.to === appConfig.uiTheme && resolveUiThemeId(lastToggle.from, systemThemeKind) !== shown) {
      next = lastToggle.from;
      lastToggle = null;
    } else {
      next = toggledUiThemeId(shown);
      lastToggle = { from: appConfig.uiTheme, to: next };
    }
    // The open Settings screen edits a copy of appConfig and saves the whole copy: keep the copy's theme in step.
    const settingsCopy = modalScreens.data.applicationSettings.appConfig;
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        appConfig: { ...appConfig, uiTheme: next },
        modalScreens: settingsCopy
          ? {
            ...modalScreens,
            data: {
              ...modalScreens.data,
              applicationSettings: { ...modalScreens.data.applicationSettings, appConfig: { ...settingsCopy, uiTheme: next } }
            }
          }
          : modalScreens
      }
    })
  }

  return useCase;
}

export type ToggleUiThemeUseCase = ReturnType<typeof createToggleUiThemeUseCase>;
