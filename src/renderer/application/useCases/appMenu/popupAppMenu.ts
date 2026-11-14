/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';

type Deps = {
  appMenu: AppMenuProvider;
}

/** Opens a top-level app menu under the app's own menu bar. Resolves when the menu closes. */
export function createPopupAppMenuUseCase({ appMenu }: Deps) {
  return (index: number, x: number, y: number) => appMenu.popup(index, x, y);
}

export type PopupAppMenuUseCase = ReturnType<typeof createPopupAppMenuUseCase>;
