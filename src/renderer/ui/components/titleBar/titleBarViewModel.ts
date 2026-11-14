/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PopupAppMenuUseCase } from '@/application/useCases/appMenu/popupAppMenu';
import { SetTitleBarColorsUseCase } from '@/application/useCases/appMenu/setTitleBarColors';
import { resolveUiThemeId } from '@/base/uiTheme';
import { uiThemes } from '@/ui/components/app/uiTheme/themes';
import { UseAppState } from '@/ui/hooks/appState';
import { useEffect } from 'react';

type Deps = {
  useAppState: UseAppState;
  popupAppMenuUseCase: PopupAppMenuUseCase;
  setTitleBarColorsUseCase: SetTitleBarColorsUseCase;
  /** False on macOS: the OS draws the title bar there and the menu is at the top of the screen. */
  hasAppTitleBar: boolean;
  /** The window's title ("(dev)" in a run from the repo, which the OS title bar used to show). */
  windowTitle: string;
}

export function createTitleBarViewModelHook({
  useAppState,
  popupAppMenuUseCase,
  setTitleBarColorsUseCase,
  hasAppTitleBar,
  windowTitle,
}: Deps) {
  function useViewModel() {
    const [labels, menuBar, uiTheme, systemThemeKind] = useAppState(state => [
      state.ui.appMenuLabels,
      state.ui.menuBar,
      state.ui.appConfig.uiTheme,
      state.ui.systemThemeKind,
    ]);
    // Not from the Window Controls Overlay API: navigator.windowControlsOverlay and env(titlebar-area-*) were not ready
    // when the page first rendered, and later changes did not reach the page's styles (observed in the dev app).
    const visible = hasAppTitleBar;
    const themeId = resolveUiThemeId(uiTheme, systemThemeKind);

    useEffect(() => {
      if (visible) {
        const theme = uiThemes[themeId];
        setTitleBarColorsUseCase(theme.topBarBackground, theme.componentColor).catch(err => console.error('Title bar colors', err));
      }
    }, [visible, themeId]);

    return {
      visible,
      labels,
      menuBar,
      windowTitle,
      popupMenu: popupAppMenuUseCase,
    }
  }

  return useViewModel;
}

export type TitleBarViewModelHook = ReturnType<typeof createTitleBarViewModelHook>;
