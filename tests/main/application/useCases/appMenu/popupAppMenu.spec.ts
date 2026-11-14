/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';
import { BrowserWindow } from '@/application/interfaces/browserWindow';
import { createPopupAppMenuUseCase } from '@/application/useCases/appMenu/popupAppMenu';
import { createSetTitleBarColorsUseCase } from '@/application/useCases/appMenu/setTitleBarColors';

function setup() {
  const appMenuProvider: AppMenuProvider = {
    setMenu: jest.fn(),
    setAutoHide: jest.fn(),
    popup: jest.fn(async () => undefined),
    setTitleBarColors: jest.fn(),
  };
  const win = { 'test': 'obj' } as unknown as BrowserWindow;
  return {
    appMenuProvider,
    win,
    popup: createPopupAppMenuUseCase({ appMenuProvider }),
    setColors: createSetTitleBarColorsUseCase({ appMenuProvider }),
  };
}

describe('popupAppMenuUseCase()', () => {
  it('opens the menu at whole pixels', async () => {
    const { appMenuProvider, win, popup } = setup();
    await popup(2, 10.4, 30.6, win);
    expect(appMenuProvider.popup).toHaveBeenCalledWith(2, 10, 31, win);
  });

  const badRequests = [[-1, 0, 0], [1.5, 0, 0], ['1', 0, 0], [0, Number.NaN, 0], [0, 0, Infinity], [0, '0', 0]];
  it.each(badRequests)('ignores a bad request from the page: %p, %p, %p', async (index, x, y) => {
    const { appMenuProvider, win, popup } = setup();
    await popup(index, x, y, win);
    expect(appMenuProvider.popup).not.toHaveBeenCalled();
  });
});

describe('setTitleBarColorsUseCase()', () => {
  it('passes #RRGGBB colors and ignores anything else', async () => {
    const { appMenuProvider, win, setColors } = setup();
    await setColors('#282A36', '#f8f8f2', win);
    expect(appMenuProvider.setTitleBarColors).toHaveBeenCalledWith('#282A36', '#f8f8f2', win);

    await setColors('red', '#FFFFFF', win);
    await setColors('#FFFFFF80', '#FFFFFF', win);
    await setColors('#FFFFFF', 3, win);
    expect(appMenuProvider.setTitleBarColors).toHaveBeenCalledTimes(1);
  });
});
