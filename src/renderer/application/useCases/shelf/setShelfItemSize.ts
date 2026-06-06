/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';

export const shelfWidgetDefaultW = 300;
export const shelfWidgetDefaultH = 150;
export const shelfWidgetMinW = 150;
export const shelfWidgetMinH = 80;
export const shelfWidgetMaxW = 1200;
export const shelfWidgetMaxH = 900;

const clampW = (w: number) => Math.min(shelfWidgetMaxW, Math.max(shelfWidgetMinW, Math.round(w)));
const clampH = (h: number) => Math.min(shelfWidgetMaxH, Math.max(shelfWidgetMinH, Math.round(h)));

/**
 * Set the popup-box size (px) for a Top Bar shelf widget. Clamped to a sane
 * range. Persists via the store's auto-save like any other shelf change.
 */
export function createSetShelfItemSizeUseCase({
  appStore,
}: {
  appStore: AppStore;
}) {
  const useCase = (itemId: string, w: number, h: number) => {
    const cw = clampW(w);
    const ch = clampH(h);
    const state = appStore.get();
    const { widgetList } = state.ui.shelf;
    const idx = widgetList.findIndex(item => item.id === itemId);
    if (idx < 0) {
      return;
    }
    const item = widgetList[idx];
    if (item.w === cw && item.h === ch) {
      return;
    }
    const newList = [...widgetList];
    newList[idx] = { ...item, w: cw, h: ch };
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        shelf: {
          ...state.ui.shelf,
          widgetList: newList
        }
      }
    });
  };

  return useCase;
}

export type SetShelfItemSizeUseCase = ReturnType<typeof createSetShelfItemSizeUseCase>;
