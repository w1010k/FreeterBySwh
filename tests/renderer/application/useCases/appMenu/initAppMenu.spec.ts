/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { MenuItem } from '@common/base/menu';
import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';
import { ProcessProvider } from '@/application/interfaces/processProvider';
import { createInitAppMenuUseCase } from '@/application/useCases/appMenu/initAppMenu';
import { AppState } from '@/base/state/app';
import { ProcessInfo } from '@common/base/process';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { mockShellProvider } from '@tests/infra/mocks/shellProvider';
import { fixtureProcessInfoLinux } from '@testscommon/base/fixtures/process'

async function setup(initState: AppState, opts?: {
  processInfo?: ProcessInfo
}) {
  const [appStore] = await fixtureAppStore(initState);
  const appMenuProviderMock: AppMenuProvider = {
    setMenu: jest.fn(),
    setAutoHide: jest.fn(),
    popup: jest.fn(),
    setTitleBarColors: jest.fn(),
  }
  const processProviderMock: ProcessProvider = {
    getProcessInfo: () => opts?.processInfo || fixtureProcessInfoLinux()
  }
  const shellProviderMock = mockShellProvider({
    openExternal: jest.fn()
  })
  const toggleEditModeUseCase = jest.fn();
  const toggleMenuBarUseCase = jest.fn();
  const toggleTopBarUseCase = jest.fn();
  const toggleUiThemeUseCase = jest.fn();
  const setProjectSwitcherPositionUseCase = jest.fn();
  const setEditTogglePositionUseCase = jest.fn();
  const openApplicationSettingsUseCase = jest.fn();
  const openAnalyticsUseCase = jest.fn();
  const openAboutUseCase = jest.fn();
  const openAppManagerUseCase = jest.fn();
  const openProjectManagerUseCase = jest.fn();
  const switchWorkflowByOffsetUseCase = jest.fn();
  const appDataBackupProvider = { backUp: jest.fn(async () => undefined), restore: jest.fn(async () => undefined) };
  const flushAppData = jest.fn();
  const initAppMenuUseCase = createInitAppMenuUseCase({
    appStore,
    appMenu: appMenuProviderMock,
    processProvider: processProviderMock,
    shellProvider: shellProviderMock,
    appDataBackupProvider,
    flushAppData,
    toggleEditModeUseCase,
    toggleMenuBarUseCase,
    toggleTopBarUseCase,
    toggleUiThemeUseCase,
    setProjectSwitcherPositionUseCase,
    setEditTogglePositionUseCase,
    openApplicationSettingsUseCase,
    openAnalyticsUseCase,
    openAboutUseCase,
    openAppManagerUseCase,
    openProjectManagerUseCase,
    switchWorkflowByOffsetUseCase,
  });
  return {
    appStore,
    appMenuProviderMock,
    shellProviderMock,
    initAppMenuUseCase,
    toggleEditModeUseCase,
    toggleMenuBarUseCase,
    toggleTopBarUseCase,
    toggleUiThemeUseCase,
    setProjectSwitcherPositionUseCase,
    openAboutUseCase,
    appDataBackupProvider,
    flushAppData,
  }
}

describe('initAppMenuUseCase()', () => {
  it('should call appMenu\'s setAutoHide() right after call', async () => {
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
    } = await setup(fixtureAppState({}))

    initAppMenuUseCase();

    expect(appMenuProviderMock.setAutoHide).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to state changes and call appMenu\'s setAutoHide() with right params, when the menuBar state value changes', async () => {
    const state = fixtureAppState({ ui: { menuBar: false } })
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        menuBar: true
      }
    })

    expect(appMenuProviderMock.setAutoHide).toHaveBeenCalledTimes(2);
    expect(appMenuProviderMock.setAutoHide).toHaveBeenNthCalledWith(2, false);

    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        menuBar: false
      }
    })

    expect(appMenuProviderMock.setAutoHide).toHaveBeenNthCalledWith(3, true);
  });

  it('should not call appMenu\'s setAutoHide(), when non menuBar state changes', async () => {
    const state = fixtureAppState({ ui: { editMode: false } })
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        editMode: true
      }
    })

    expect(appMenuProviderMock.setAutoHide).toHaveBeenCalledTimes(1);
  });

  it('should not call appMenu\'s setAutoHide(), when the new state has isLoading=true', async () => {
    const state = fixtureAppState({ ui: { menuBar: true } });
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({ ...state, isLoading: true, ui: { ...state.ui, menuBar: false } })

    expect(appMenuProviderMock.setAutoHide).toHaveBeenCalledTimes(1);
  });

  it('should call appMenu\'s setAutoHide(), when the new state has isLoading=undefined', async () => {
    const { isLoading: _, ...state } = fixtureAppState({ ui: { menuBar: true } });
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({ ...state, ui: { ...state.ui, menuBar: false } })

    expect(appMenuProviderMock.setAutoHide).toHaveBeenCalledTimes(2);
  });

  it('should call appMenu\'s setMenu() right after call', async () => {
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
    } = await setup(fixtureAppState({}))

    initAppMenuUseCase();

    expect(appMenuProviderMock.setMenu).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to state changes and call appMenu\'s setMenu(), when the new state has changes the app menu depends on', async () => {
    const state = fixtureAppState({ ui: { editMode: false } })
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        editMode: true
      }
    })

    expect(appMenuProviderMock.setMenu).toHaveBeenCalledTimes(2);
  });

  it('should not call appMenu\'s setMenu(), when the new state does not have changes the app menu depends on', async () => {
    const state = fixtureAppState({ ui: { editMode: false } })
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({
      ...state,
    })

    expect(appMenuProviderMock.setMenu).toHaveBeenCalledTimes(1);
  });

  it('should not call appMenu\'s setMenu(), when the new state has isLoading=true', async () => {
    const state = fixtureAppState({ ui: { editMode: true } });
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({ ...state, isLoading: true, ui: { ...state.ui, editMode: false } })

    expect(appMenuProviderMock.setMenu).toHaveBeenCalledTimes(1);
  });

  it('should call appMenu\'s setMenu(), when the new state has isLoading=undefined', async () => {
    const { isLoading: _, ...state } = fixtureAppState({ ui: { editMode: true } });
    const {
      initAppMenuUseCase,
      appMenuProviderMock,
      appStore
    } = await setup(state)

    initAppMenuUseCase();

    appStore.set({ ...state, ui: { ...state.ui, editMode: false } })

    expect(appMenuProviderMock.setMenu).toHaveBeenCalledTimes(2);
  });

  it('File menu Back Up Data writes the pending data first, then asks main to back up; Restore Data asks main to restore', async () => {
    const { initAppMenuUseCase, appMenuProviderMock, appDataBackupProvider, flushAppData } = await setup(fixtureAppState({}));
    initAppMenuUseCase();

    const menus = (appMenuProviderMock.setMenu as jest.Mock).mock.calls[0][0] as MenuItem[];
    const file = menus.find(m => m.label === '&File')!.submenu!;
    const backUp = file.find(i => i.label === 'Back Up Data…')!;
    const restore = file.find(i => i.label === 'Restore Data…')!;
    expect(file.map(i => i.label)).toEqual(expect.arrayContaining(['Open Data Folder', 'Back Up Data…', 'Restore Data…']));

    await backUp.doAction!();
    expect(flushAppData.mock.invocationCallOrder[0]).toBeLessThan(appDataBackupProvider.backUp.mock.invocationCallOrder[0]);
    await restore.doAction!();
    expect(appDataBackupProvider.restore).toHaveBeenCalledTimes(1);
  });

  it('puts the top-level menu names in the state, for the app\'s own menu bar', async () => {
    const { initAppMenuUseCase, appStore } = await setup(fixtureAppState({}));
    initAppMenuUseCase();

    expect(appStore.get().ui.appMenuLabels).toEqual(['&File', '&Edit', '&View', '&Help']);
  });

  it('View > Appearance switches the light/dark theme with CmdOrCtrl+Shift+L', async () => {
    const { initAppMenuUseCase, appMenuProviderMock, toggleUiThemeUseCase } = await setup(fixtureAppState({}));
    initAppMenuUseCase();

    const menus = (appMenuProviderMock.setMenu as jest.Mock).mock.calls[0][0] as MenuItem[];
    const appearance = menus.find(m => m.label === '&View')!.submenu!.find(i => i.label === 'Appearance')!.submenu!;
    const item = appearance.find(i => i.label === 'Switch Light/Dark Theme')!;
    expect(item.accelerator).toBe('CmdOrCtrl+Shift+L');

    await item.doAction!();
    expect(toggleUiThemeUseCase).toHaveBeenCalledTimes(1);
  });
})
