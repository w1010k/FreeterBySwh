/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { modalScreensStateActions } from '@/base/state/actions';

type Deps = {
  appStore: AppStore;
}

export function createOpenAnalyticsUseCase({
  appStore,
}: Deps) {
  const useCase = () => {
    let state = appStore.get();
    state = modalScreensStateActions.openModalScreen(state, 'analytics', undefined);
    appStore.set(state);
  }

  return useCase;
}

export type OpenAnalyticsUseCase = ReturnType<typeof createOpenAnalyticsUseCase>;
