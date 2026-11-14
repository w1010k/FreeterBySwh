/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTitleBarComponent, createTitleBarViewModelHook, mnemonicOf } from '@/ui/components/titleBar';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { createAppStateHook } from '@/ui/hooks/appState';
import { AppState } from '@/base/state/app';
import { uiThemes } from '@/ui/components/app/uiTheme/themes';

async function setup(opts: { visible?: boolean; ui?: Partial<AppState['ui']> } = {}) {
  const initState = fixtureAppState({ ui: { appMenuLabels: ['&File', '&Edit', '&View', '&Help'], ...opts.ui } });
  const [appStore, appStoreForUi] = await fixtureAppStore(initState);
  let closeMenu: () => void = () => undefined;
  const popupAppMenuUseCase = jest.fn((_index: number, _x: number, _y: number) => new Promise<void>(resolve => { closeMenu = resolve; }));
  const setTitleBarColorsUseCase = jest.fn(async (_color: string, _symbolColor: string) => undefined);
  const TitleBar = createTitleBarComponent({
    useTitleBarViewModel: createTitleBarViewModelHook({
      useAppState: createAppStateHook(appStoreForUi),
      popupAppMenuUseCase,
      setTitleBarColorsUseCase,
      hasAppTitleBar: opts.visible ?? true,
      windowTitle: 'Acedeck (dev)',
    })
  });
  const comp = render(<><input aria-label="note"/><TitleBar/></>);
  return { appStore, comp, popupAppMenuUseCase, setTitleBarColorsUseCase, closeMenu: () => act(() => closeMenu()) };
}

describe('TitleBar', () => {
  it('draws nothing on macOS (the OS title bar and menu)', async () => {
    await setup({ visible: false });
    expect(screen.queryByTestId('title-bar')).not.toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--app-title-bar-height')).toBe('');
  });

  it('puts the app layout under the bar while it is shown', async () => {
    const { comp } = await setup();
    expect(document.documentElement.style.getPropertyValue('--app-title-bar-height')).toBe('30px');
    comp.unmount();
    expect(document.documentElement.style.getPropertyValue('--app-title-bar-height')).toBe('');
  });

  it('shows the menu names and gives the window buttons the theme colors', async () => {
    const { setTitleBarColorsUseCase } = await setup({ ui: { appConfig: { ...fixtureAppState({}).ui.appConfig, uiTheme: 'dracula' } } });

    expect(screen.getAllByRole('menuitem').map(b => b.textContent)).toEqual(['File', 'Edit', 'View', 'Help']);
    expect(setTitleBarColorsUseCase).toHaveBeenCalledWith(uiThemes.dracula.topBarBackground, uiThemes.dracula.componentColor);
  });

  it('opens a menu on click under its name, and gives the focus back when it closes', async () => {
    const { popupAppMenuUseCase, closeMenu } = await setup();
    const note = screen.getByRole('textbox', { name: 'note' });
    note.focus();
    const view = screen.getByRole('menuitem', { name: 'View' });
    view.getBoundingClientRect = () => ({ left: 80, bottom: 30 } as DOMRect);

    fireEvent.click(view);

    expect(popupAppMenuUseCase).toHaveBeenCalledWith(2, 80, 30);
    expect(view).toHaveAttribute('aria-expanded', 'true');
    await closeMenu();
    expect(view).toHaveAttribute('aria-expanded', 'false');
    expect(note).toHaveFocus();
  });

  it('opens a menu with Alt+its letter', async () => {
    const { popupAppMenuUseCase } = await setup();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyDown(window, { key: 'ㄷ', code: 'KeyE', altKey: true });
    expect(popupAppMenuUseCase).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
  });

  it('moves the focus into the menu bar on Alt alone; arrows move, Enter opens, Escape gives the focus back', async () => {
    const { popupAppMenuUseCase } = await setup();
    const note = screen.getByRole('textbox', { name: 'note' });
    note.focus();

    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('menuitem', { name: 'Help' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Help' }), { key: 'ArrowRight' });
    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'Escape' });
    expect(note).toHaveFocus();
    expect(popupAppMenuUseCase).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'File' }), { key: 'Enter' });
    expect(popupAppMenuUseCase).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
  });

  it('leaves Alt+letter to a focused element that uses it (Terminal sends it to the shell)', async () => {
    const { popupAppMenuUseCase } = await setup();
    const note = screen.getByRole('textbox', { name: 'note' });
    note.addEventListener('keydown', e => e.preventDefault());
    fireEvent.keyDown(note, { key: 'f', code: 'KeyF', altKey: true });
    expect(popupAppMenuUseCase).not.toHaveBeenCalled();
  });

  it('shows the window title', async () => {
    await setup();
    expect(screen.getByText('Acedeck (dev)')).toBeInTheDocument();
  });

  it('does not take the release of Alt after a key a focused element stopped (Alt+F in the Terminal)', async () => {
    await setup();
    const note = screen.getByRole('textbox', { name: 'note' });
    note.focus();
    note.addEventListener('keydown', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    fireEvent.keyDown(note, { key: 'Alt', altKey: true });
    fireEvent.keyDown(note, { key: 'f', code: 'KeyF', altKey: true });
    fireEvent.keyUp(note, { key: 'Alt' });
    expect(note).toHaveFocus();
  });

  it('does not take Alt used with the mouse (Alt+click, Alt+drag)', async () => {
    await setup();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.mouseDown(document.body, { altKey: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByRole('menuitem', { name: 'File' })).not.toHaveFocus();
  });

  it('takes Alt held long (auto-repeat) and released alone', async () => {
    await setup();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyDown(window, { key: 'Alt', altKey: true, repeat: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByRole('menuitem', { name: 'File' })).toHaveFocus();
  });

  it('does not take Alt used with another key (Alt+Tab, Alt+arrow)', async () => {
    await setup();
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(screen.getByRole('menuitem', { name: 'File' })).not.toHaveFocus();
  });

  it('hides the names with Hide Menu Bar until the menu bar is in use', async () => {
    await setup({ ui: { menuBar: false } });
    expect(screen.getByRole('menubar').className).toMatch(/is-auto-hidden/);
  });

});

describe('mnemonicOf()', () => {
  it('is the letter after &', () => {
    expect(mnemonicOf('&File')).toBe('f');
    expect(mnemonicOf('Dev')).toBe('');
    expect(mnemonicOf('End&')).toBe('');
  });
});
