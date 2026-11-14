/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { UiThemeKind } from '@/base/uiTheme';

type Deps = {
  appStore: AppStore;
}

/** Records the OS light/dark mode, which the 'system' Theme setting shows. */
export function createSetSystemThemeKindUseCase({
  appStore
}: Deps) {
  const useCase = (kind: UiThemeKind) => {
    const state = appStore.get();
    if (state.ui.systemThemeKind === kind) {
      return;
    }
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        systemThemeKind: kind
      }
    })
  }

  return useCase;
}

export type SetSystemThemeKindUseCase = ReturnType<typeof createSetSystemThemeKindUseCase>;
