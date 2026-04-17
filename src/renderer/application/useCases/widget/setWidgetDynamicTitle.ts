/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { EntityId } from '@/base/entity';

type Deps = {
  appStore: AppStore;
}

export function createSetWidgetDynamicTitleUseCase({ appStore }: Deps) {
  const useCase = (widgetId: EntityId, title: string | null) => {
    const state = appStore.get();
    const current = state.ui.widgetDynamicTitles;
    const existing = current[widgetId];
    const normalized = typeof title === 'string' && title.trim() !== '' ? title : null;

    if (normalized === null) {
      if (!(widgetId in current)) {
        return;
      }
      const { [widgetId]: _omit, ...rest } = current;
      appStore.set({
        ...state,
        ui: { ...state.ui, widgetDynamicTitles: rest }
      });
      return;
    }

    if (existing === normalized) {
      return;
    }
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        widgetDynamicTitles: { ...current, [widgetId]: normalized }
      }
    });
  }
  return useCase;
}

export type SetWidgetDynamicTitleUseCase = ReturnType<typeof createSetWidgetDynamicTitleUseCase>;
