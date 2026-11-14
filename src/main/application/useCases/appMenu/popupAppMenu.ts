/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';
import { BrowserWindow } from '@/application/interfaces/browserWindow';

interface Deps {
  appMenuProvider: AppMenuProvider;
}

export function createPopupAppMenuUseCase(deps: Deps) {
  const { appMenuProvider } = deps;
  return async function popupAppMenuUseCase(index: unknown, x: unknown, y: unknown, windowTarget: BrowserWindow): Promise<void> {
    if (!Number.isInteger(index) || (index as number) < 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    await appMenuProvider.popup(index as number, Math.round(x as number), Math.round(y as number), windowTarget);
  }
}

export type PopupAppMenuUseCase = ReturnType<typeof createPopupAppMenuUseCase>;
