/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSetWorkflowBarWidthUseCase } from '@/application/useCases/applicationSettings/setWorkflowBarWidth';
import { AppState } from '@/base/state/app';
import { fixtureAppConfig } from '@tests/base/fixtures/appConfig';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup(initState: AppState) {
  const [appStore] = await fixtureAppStore(initState);
  const setWorkflowBarWidthUseCase = createSetWorkflowBarWidthUseCase({
    appStore
  });
  return {
    appStore,
    setWorkflowBarWidthUseCase
  }
}

function stateWithWidth(width: number): AppState {
  return fixtureAppState({
    ui: {
      appConfig: fixtureAppConfig({ workflowBarWidth: width })
    }
  })
}

describe('setWorkflowBarWidthUseCase()', () => {
  it('should update the workflow bar width in appConfig', async () => {
    const { appStore, setWorkflowBarWidthUseCase } = await setup(stateWithWidth(200));

    setWorkflowBarWidthUseCase(320);

    expect(appStore.get().ui.appConfig.workflowBarWidth).toBe(320);
  })

  it('should round fractional widths', async () => {
    const { appStore, setWorkflowBarWidthUseCase } = await setup(stateWithWidth(200));

    setWorkflowBarWidthUseCase(321.6);

    expect(appStore.get().ui.appConfig.workflowBarWidth).toBe(322);
  })

  it('should clamp below the minimum width', async () => {
    const { appStore, setWorkflowBarWidthUseCase } = await setup(stateWithWidth(200));

    setWorkflowBarWidthUseCase(10);

    expect(appStore.get().ui.appConfig.workflowBarWidth).toBe(120);
  })

  it('should clamp above the maximum width', async () => {
    const { appStore, setWorkflowBarWidthUseCase } = await setup(stateWithWidth(200));

    setWorkflowBarWidthUseCase(9999);

    expect(appStore.get().ui.appConfig.workflowBarWidth).toBe(600);
  })

  it('should not touch the store when the clamped width is unchanged', async () => {
    const { appStore, setWorkflowBarWidthUseCase } = await setup(stateWithWidth(200));
    const prevState = appStore.get();

    setWorkflowBarWidthUseCase(200);

    expect(appStore.get()).toBe(prevState);
  })
})
