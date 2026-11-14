/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createToggleUiThemeUseCase } from '@/application/useCases/uiTheme/toggleUiTheme';
import { createSetSystemThemeKindUseCase } from '@/application/useCases/uiTheme/setSystemThemeKind';
import { UiThemeKind } from '@/base/uiTheme';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup(uiTheme: string, systemThemeKind: UiThemeKind = 'light') {
  const initState = fixtureAppState({});
  const [appStore] = await fixtureAppStore({
    ...initState,
    ui: { ...initState.ui, systemThemeKind, appConfig: { ...initState.ui.appConfig, uiTheme } }
  });
  const toggle = createToggleUiThemeUseCase({ appStore });
  const theme = () => appStore.get().ui.appConfig.uiTheme;
  const setTheme = (id: string) => {
    const state = appStore.get();
    appStore.set({ ...state, ui: { ...state.ui, appConfig: { ...state.ui.appConfig, uiTheme: id } } });
  };
  return { appStore, toggle, theme, setTheme };
}

describe('toggleUiThemeUseCase()', () => {
  it('switches Light and Dark', async () => {
    const { toggle, theme } = await setup('light');
    toggle();
    expect(theme()).toBe('dark');
    toggle();
    expect(theme()).toBe('light');
  });

  it('switches a theme to its pair', async () => {
    const { toggle, theme } = await setup('catppuccin-mocha');
    toggle();
    expect(theme()).toBe('catppuccin-latte');
    toggle();
    expect(theme()).toBe('catppuccin-mocha');
  });

  it('goes from a theme without a pair to Light, and back to that theme on the next toggle', async () => {
    const { toggle, theme } = await setup('nord');
    toggle();
    expect(theme()).toBe('light');
    toggle();
    expect(theme()).toBe('nord');
  });

  it('goes from System to the other kind than the OS mode, and back to System', async () => {
    const { toggle, theme } = await setup('system', 'dark');
    toggle();
    expect(theme()).toBe('light');
    toggle();
    expect(theme()).toBe('system');
  });

  it('starts over from the current theme when it was changed after the last toggle', async () => {
    const { toggle, theme, setTheme } = await setup('nord');
    toggle();
    setTheme('dracula');
    toggle();
    expect(theme()).toBe('light');
  });

  it('forgets the way back when the theme changed another way, even back to the same value', async () => {
    const { toggle, theme, setTheme } = await setup('nord');
    toggle();
    setTheme('dracula');
    setTheme('light');
    toggle();
    expect(theme()).toBe('dark');
  });

  it('does not go back to System when System now shows the theme on screen (the OS mode changed)', async () => {
    const { appStore, toggle, theme } = await setup('system', 'dark');
    toggle();
    expect(theme()).toBe('light');
    const state = appStore.get();
    appStore.set({ ...state, ui: { ...state.ui, systemThemeKind: 'light' } });
    toggle();
    expect(theme()).toBe('dark');
  });

  it('keeps the open Settings screen copy in step, so Save does not undo the toggle', async () => {
    const { appStore, toggle } = await setup('light');
    const state = appStore.get();
    const { modalScreens } = state.ui;
    appStore.set({
      ...state,
      ui: {
        ...state.ui,
        modalScreens: { ...modalScreens, data: { ...modalScreens.data, applicationSettings: { appConfig: { ...state.ui.appConfig, bgColor: '#123456' } } } }
      }
    });
    toggle();
    expect(appStore.get().ui.modalScreens.data.applicationSettings.appConfig).toEqual({ ...state.ui.appConfig, bgColor: '#123456', uiTheme: 'dark' });
  });
});

describe('setSystemThemeKindUseCase()', () => {
  it('records the OS mode and leaves the state as is when it did not change', async () => {
    const { appStore } = await setup('system');
    const setKind = createSetSystemThemeKindUseCase({ appStore });
    const before = appStore.get();

    setKind('light');
    expect(appStore.get()).toBe(before);

    setKind('dark');
    expect(appStore.get().ui.systemThemeKind).toBe('dark');
  });
});
