/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createContextMenuFactory } from '@/widgets/webpage/contextMenu';
import { WidgetApi, WidgetMenuItem } from '@/widgets/appModules';

function setup() {
  const elWebview = {
    getWebContentsId: jest.fn(() => 7), getZoomFactor: jest.fn(() => 1), getURL: jest.fn(() => 'https://page.test/'),
    canGoBack: jest.fn(() => false), canGoForward: jest.fn(() => false)
  } as unknown as Electron.WebviewTag;
  const clipboard = { writeText: jest.fn(), writeBookmark: jest.fn(), copyImageAt: jest.fn() };
  const widgetApi = { clipboard } as unknown as WidgetApi;
  const factory = createContextMenuFactory(elWebview, widgetApi, 'https://home.test/', 0, false, jest.fn());
  return { factory, clipboard };
}

const imageParams = {
  x: 10, y: 20, linkURL: '', srcURL: 'https://img.test/a.png', mediaType: 'image', isEditable: false, selectionText: '',
  editFlags: {}
};

describe('webpage context menu', () => {
  it('copies the image at the clicked point of the page from the image menu', async () => {
    const { factory, clipboard } = setup();

    const items = factory('', imageParams) as WidgetMenuItem[];
    const copy = items.find(i => i.label === 'Copy image');
    await copy!.doAction!();

    expect(items.map(i => i.label).slice(0, 3)).toEqual(['Save image as…', 'Copy image', 'Copy image address']);
    expect(clipboard.copyImageAt).toHaveBeenCalledWith(7, 10, 20);
  });
});
