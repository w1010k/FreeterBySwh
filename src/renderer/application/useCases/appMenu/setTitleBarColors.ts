/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';

type Deps = {
  appMenu: AppMenuProvider;
}

/** Colors the window buttons (minimize, maximize, close) that the OS draws over the app's title bar. */
export function createSetTitleBarColorsUseCase({ appMenu }: Deps) {
  return (color: string, symbolColor: string) => appMenu.setTitleBarColors(color, symbolColor);
}

export type SetTitleBarColorsUseCase = ReturnType<typeof createSetTitleBarColorsUseCase>;
