/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DownloadProvider } from '@/application/interfaces/downloadProvider';
import { createInitDownloadDirUseCase } from '@/application/useCases/download/initDownloadDir';
import { AppState } from '@/base/state/app';
import { fixtureAppConfig } from '@tests/base/fixtures/appConfig';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup(initState: AppState) {
  const [appStore] = await fixtureAppStore(initState);
  const downloadProviderMock: DownloadProvider = {
    setDownloadDir: jest.fn()
  }
  const initDownloadDirUseCase = createInitDownloadDirUseCase({
    appStore, download: downloadProviderMock
  });
  return {
    appStore,
    downloadProviderMock,
    initDownloadDirUseCase,
  }
}

describe('initDownloadDirUseCase()', () => {
  it('should call setDownloadDir() right after call', async () => {
    const { initDownloadDirUseCase, downloadProviderMock } = await setup(fixtureAppState({}))

    initDownloadDirUseCase();

    expect(downloadProviderMock.setDownloadDir).toHaveBeenCalledTimes(1);
  });

  it('should call setDownloadDir() with the new dir when the downloadDir state value changes', async () => {
    const dir = 'C:\\Downloads\\custom';
    const state = fixtureAppState({ ui: { appConfig: fixtureAppConfig({ downloadDir: '' }) } })
    const { initDownloadDirUseCase, downloadProviderMock, appStore } = await setup(state)

    initDownloadDirUseCase();

    appStore.set({
      ...state,
      ui: { ...state.ui, appConfig: { ...state.ui.appConfig, downloadDir: dir } }
    })

    expect(downloadProviderMock.setDownloadDir).toHaveBeenCalledTimes(2);
    expect(downloadProviderMock.setDownloadDir).toHaveBeenNthCalledWith(2, dir);
  });

  it('should not call setDownloadDir() when an unrelated state value changes', async () => {
    const state = fixtureAppState({ ui: { editMode: false } })
    const { initDownloadDirUseCase, downloadProviderMock, appStore } = await setup(state)

    initDownloadDirUseCase();

    appStore.set({ ...state, ui: { ...state.ui, editMode: true } })

    expect(downloadProviderMock.setDownloadDir).toHaveBeenCalledTimes(1);
  });

  it('should not call setDownloadDir() when the new state has isLoading=true', async () => {
    const state = fixtureAppState({ ui: { appConfig: fixtureAppConfig({ downloadDir: '' }) } });
    const { initDownloadDirUseCase, downloadProviderMock, appStore } = await setup(state)

    initDownloadDirUseCase();

    appStore.set({ ...state, isLoading: true, ui: { ...state.ui, appConfig: { ...state.ui.appConfig, downloadDir: 'X' } } })

    expect(downloadProviderMock.setDownloadDir).toHaveBeenCalledTimes(1);
  });
})
