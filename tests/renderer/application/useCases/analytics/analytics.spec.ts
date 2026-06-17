/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createOpenAnalyticsUseCase } from '@/application/useCases/analytics/openAnalytics';
import { createCloseAnalyticsUseCase } from '@/application/useCases/analytics/closeAnalytics';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';

async function setup() {
  const [appStore] = await fixtureAppStore(fixtureAppState({}));
  return {
    appStore,
    openAnalyticsUseCase: createOpenAnalyticsUseCase({ appStore }),
    closeAnalyticsUseCase: createCloseAnalyticsUseCase({ appStore }),
  }
}

describe('analytics open/close use cases', () => {
  it('opens the analytics modal screen', async () => {
    const { appStore, openAnalyticsUseCase } = await setup();

    openAnalyticsUseCase();

    expect(appStore.get().ui.modalScreens.order).toContain('analytics');
  });

  it('closes the analytics modal screen', async () => {
    const { appStore, openAnalyticsUseCase, closeAnalyticsUseCase } = await setup();
    openAnalyticsUseCase();

    closeAnalyticsUseCase();

    expect(appStore.get().ui.modalScreens.order).not.toContain('analytics');
  });
})
