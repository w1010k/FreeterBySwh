/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createActionBarItems } from '@/widgets/webpage/actionBar';
import { WidgetApi } from '@/base/widgetApi';

function setupMocks(currentUrl = 'https://example.com/path?q=1') {
  const elWebview = {
    getURL: jest.fn(() => currentUrl),
    canGoBack: jest.fn(() => false),
    canGoForward: jest.fn(() => false),
    isLoading: jest.fn(() => false),
  } as unknown as Electron.WebviewTag;

  const clipboard = { writeText: jest.fn(), writeBookmark: jest.fn() };
  const shell = { openExternalUrl: jest.fn(), openApp: jest.fn(), openPath: jest.fn() };
  const widgetApi = { clipboard, shell } as unknown as WidgetApi;

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

  it('should place COPY-URL between RELOAD and OPEN-IN-BROWSER', () => {
    const { elWebview, widgetApi } = setupMocks();
    const items = createActionBarItems(elWebview, widgetApi, 'https://example.com', 0, false, () => undefined);

    const ids = items.map(item => item.id);
    const reloadIdx = ids.indexOf('RELOAD');
    const copyIdx = ids.indexOf('COPY-URL');
    const openIdx = ids.indexOf('OPEN-IN-BROWSER');

    expect(reloadIdx).toBeGreaterThanOrEqual(0);
    expect(copyIdx).toBe(reloadIdx + 1);
    expect(openIdx).toBe(copyIdx + 1);
  })

  it('should return an empty array when the webview is null', () => {
    const { widgetApi } = setupMocks();
    const items = createActionBarItems(null, widgetApi, 'https://example.com', 0, false, () => undefined);

    expect(items).toHaveLength(0);
  })
})
