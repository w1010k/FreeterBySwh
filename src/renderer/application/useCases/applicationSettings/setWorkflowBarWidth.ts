/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';

export const workflowBarMinWidth = 120;
export const workflowBarMaxWidth = 600;

/**
 * Live-update the side workflow bar width (e.g. while dragging its edge). Clamps
 * to a sane range. Persists via the store's auto-save like any other appConfig change.
 */
export function createSetWorkflowBarWidthUseCase({
  appStore,
}: {
  appStore: AppStore;
}) {
  const useCase = (width: number) => {
    const clamped = Math.min(workflowBarMaxWidth, Math.max(workflowBarMinWidth, Math.round(width)));
    const state = appStore.get();
    if (state.ui.appConfig.workflowBarWidth === clamped) {
      return;
    }
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        appConfig: {
          ...state.ui.appConfig,
          workflowBarWidth: clamped
        }
      }
    });
  };

  return useCase;
}

export type SetWorkflowBarWidthUseCase = ReturnType<typeof createSetWorkflowBarWidthUseCase>;
