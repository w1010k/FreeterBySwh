/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createActionBarItems } from '@/widgets/webpage/actionBar';
import { WidgetApi } from '@/base/widgetApi';

function setupMocks(currentUrl = 'https://example.com/path?q=1', initialZoom = 1, isMac = false) {
  let zoom = initialZoom;
  const elWebview = {
    getURL: jest.fn(() => currentUrl),
    canGoBack: jest.fn(() => false),
    canGoForward: jest.fn(() => false),
    isLoading: jest.fn(() => false),
    stop: jest.fn(),
    reload: jest.fn(),
    getZoomFactor: jest.fn(() => zoom),
    setZoomFactor: jest.fn((factor: number) => { zoom = factor; }),
  } as unknown as Electron.WebviewTag;

  const clipboard = { writeText: jest.fn(), writeBookmark: jest.fn() };
  const shell = { openExternalUrl: jest.fn(), openApp: jest.fn(), openPath: jest.fn() };
  const process = { getProcessInfo: jest.fn(() => ({ isMac })) };
  const widgetApi = { clipboard, shell, process } as unknown as WidgetApi;

  return { elWebview, widgetApi, clipboard };
}

describe('Webpage action bar', () => {
  it('should include a COPY-URL item that writes the current URL to clipboard', async () => {
    const { elWebview, widgetApi, clipboard } = setupMocks('https://example.com/path?q=1');
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    const copyItem = items.find(item => item.id === 'COPY-URL');
    expect(copyItem).toBeDefined();
    expect(copyItem!.enabled).toBe(true);

    await copyItem!.doAction();
    expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/path?q=1');
  })

  it('should place COPY-URL immediately before OPEN-IN-BROWSER', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    const ids = items.map(item => item.id);
    const copyIdx = ids.indexOf('COPY-URL');
    const openIdx = ids.indexOf('OPEN-IN-BROWSER');

    expect(copyIdx).toBeGreaterThanOrEqual(0);
    expect(openIdx).toBe(copyIdx + 1);
  })

  it('should return an empty array when the webview is null', () => {
    const { widgetApi } = setupMocks();
    const items = createActionBarItems(null, widgetApi, 'https://example.com', 0, false, () => undefined);

    expect(items).toHaveLength(0);
  })

  it('should place ZOOM-OUT and ZOOM-IN between RELOAD and COPY-URL in that order', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    const ids = items.map(item => item.id);
    expect(ids).toEqual([
      'HOME', 'BACK', 'FORWARD', 'RELOAD',
      'ZOOM-OUT', 'ZOOM-IN',
      'COPY-URL', 'OPEN-IN-BROWSER',
    ]);
  })

  it('should step the webview zoom up when ZOOM-IN is invoked', async () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 1);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const zoomIn = items.find(item => item.id === 'ZOOM-IN');
    await zoomIn!.doAction();

    expect((elWebview as unknown as { setZoomFactor: jest.Mock }).setZoomFactor).toHaveBeenCalledWith(1.1);
  })

  it('should step the webview zoom down when ZOOM-OUT is invoked', async () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 1);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const zoomOut = items.find(item => item.id === 'ZOOM-OUT');
    await zoomOut!.doAction();

    expect((elWebview as unknown as { setZoomFactor: jest.Mock }).setZoomFactor).toHaveBeenCalledWith(0.9);
  })

  it('should append keyboard shortcut hints to the relevant button titles (non-mac)', () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 1, false);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const titleOf = (id: string) => items.find(item => item.id === id)!.title;
    expect(titleOf('HOME')).toBe('Go to start page (Alt+Home)');
    expect(titleOf('BACK')).toBe('Go Back (Alt+←)');
    expect(titleOf('FORWARD')).toBe('Go Forward (Alt+→)');
    expect(titleOf('RELOAD')).toBe('Reload this page (F5 · Ctrl+R)');
    expect(titleOf('ZOOM-OUT')).toBe('Zoom out (Ctrl+-)');
    expect(titleOf('ZOOM-IN')).toBe('Zoom in (Ctrl++)');
    expect(titleOf('OPEN-IN-BROWSER')).toBe('Open in web browser (Ctrl+T)');
  })

  it('should use the Cmd modifier in shortcut hints on macOS', () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 1, true);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const titleOf = (id: string) => items.find(item => item.id === id)!.title;
    expect(titleOf('RELOAD')).toBe('Reload this page (F5 · Cmd+R)');
    expect(titleOf('ZOOM-IN')).toBe('Zoom in (Cmd++)');
    expect(titleOf('OPEN-IN-BROWSER')).toBe('Open in web browser (Cmd+T)');
  })

  it('should leave buttons without a bound shortcut unannotated', () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 1, false);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const titleOf = (id: string) => items.find(item => item.id === id)!.title;
    expect(titleOf('COPY-URL')).toBe('Copy current address');
  })

  it('should not include a MUTE item when no mute toggle is provided', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    expect(items.find(item => item.id === 'MUTE')).toBeUndefined();
  })

  it('should include a MUTE item right after ZOOM-IN (before COPY-URL) when a mute toggle is provided', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined, false, () => undefined);

    const ids = items.map(item => item.id);
    expect(ids).toEqual([
      'HOME', 'BACK', 'FORWARD', 'RELOAD',
      'ZOOM-OUT', 'ZOOM-IN', 'MUTE',
      'COPY-URL', 'OPEN-IN-BROWSER',
    ]);
  })

  it('should label the MUTE item per current state and call the toggle when invoked', async () => {
    const onToggleMute = jest.fn();
    const { elWebview, widgetApi } = setupMocks();

    const notMuted = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined, false, onToggleMute);
    const muteItem = notMuted.find(item => item.id === 'MUTE')!;
    expect(muteItem.title).toBe('Mute audio');

    await muteItem.doAction();
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    const muted = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined, true, onToggleMute);
    expect(muted.find(item => item.id === 'MUTE')!.title).toBe('Unmute audio');
  })

  it('should not include a FIND item when no find handler is provided', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    expect(items.find(item => item.id === 'FIND')).toBeUndefined();
  })

  it('should include FIND (with Ctrl+F hint) before MUTE when both handlers are provided', async () => {
    const onFind = jest.fn();
    const { elWebview, widgetApi } = setupMocks('https://x', 1, false);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined, false, () => undefined, onFind);

    const ids = items.map(item => item.id);
    expect(ids).toEqual([
      'HOME', 'BACK', 'FORWARD', 'RELOAD',
      'ZOOM-OUT', 'ZOOM-IN', 'FIND', 'MUTE',
      'COPY-URL', 'OPEN-IN-BROWSER',
    ]);

    const findItem = items.find(item => item.id === 'FIND')!;
    expect(findItem.title).toBe('Find in page (Ctrl+F)');

    await findItem.doAction();
    expect(onFind).toHaveBeenCalledTimes(1);
  })

  it('should reset zoom to 100% and reload when RELOAD is invoked', async () => {
    const { elWebview, widgetApi } = setupMocks('https://x', 2);
    const items = createActionBarItems(elWebview, widgetApi, 'https://x', 0, false, () => undefined);

    const reload = items.find(item => item.id === 'RELOAD');
    await reload!.doAction();

    const webviewMock = elWebview as unknown as { setZoomFactor: jest.Mock; reload: jest.Mock };
    expect(webviewMock.setZoomFactor).toHaveBeenCalledWith(1);
    expect(webviewMock.reload).toHaveBeenCalledTimes(1);
  })
})
