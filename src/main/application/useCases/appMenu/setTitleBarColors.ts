/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';
import { BrowserWindow } from '@/application/interfaces/browserWindow';

interface Deps {
  appMenuProvider: AppMenuProvider;
}

const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);

export function createSetTitleBarColorsUseCase(deps: Deps) {
  const { appMenuProvider } = deps;
  return async function setTitleBarColorsUseCase(color: unknown, symbolColor: unknown, windowTarget: BrowserWindow): Promise<void> {
    if (isHexColor(color) && isHexColor(symbolColor)) {
      appMenuProvider.setTitleBarColors(color, symbolColor, windowTarget);
    }
  }
}

export type SetTitleBarColorsUseCase = ReturnType<typeof createSetTitleBarColorsUseCase>;
