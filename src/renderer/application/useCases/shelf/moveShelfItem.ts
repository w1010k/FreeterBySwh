/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { moveEntityInListByIndex } from '@/base/entityList';

/** One place left (-1) or right (1) on the shelf: the menu and keyboard way to do what dragging an item does. */
export function createMoveShelfItemUseCase({
  appStore,
}: {
  appStore: AppStore;
}) {
  const useCase = (itemId: string, offset: -1 | 1) => {
    const state = appStore.get();
    const { widgetList } = state.ui.shelf;
    const idx = widgetList.findIndex(item => item.id === itemId);
    const toIdx = idx + offset;
    if (idx < 0 || toIdx < 0 || toIdx >= widgetList.length) {
      return;
    }
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        shelf: {
          ...state.ui.shelf,
          widgetList: moveEntityInListByIndex(widgetList, idx, toIdx)
        }
      }
    });
  }

  return useCase;
}

export type MoveShelfItemUseCase = ReturnType<typeof createMoveShelfItemUseCase>;
