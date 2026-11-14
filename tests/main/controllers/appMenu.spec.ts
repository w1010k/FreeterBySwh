/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcPopupAppMenuChannel, ipcSetAppMenuAutoHideChannel, ipcSetAppMenuChannel, ipcSetTitleBarColorsChannel } from '@common/ipc/channels';
import { createAppMenuControllers } from '@/controllers/appMenu';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';
import { MenuItemsIpc } from '@common/base/menu';
import { fixtureMenuItemIpcA, fixtureMenuItemIpcB } from '@testscommon/base/fixtures/menu';
import { WebContents } from '@/application/interfaces/webContents';
import { BrowserWindow } from '@/application/interfaces/browserWindow';

function setup() {
  const setAppMenuUseCase = jest.fn(async () => undefined);
  const setAppMenuAutoHideUseCase = jest.fn(async () => undefined);
  const popupAppMenuUseCase = jest.fn(async () => undefined);
  const setTitleBarColorsUseCase = jest.fn(async () => undefined);

  const [
    setAppMenuController,
    setAppMenuAutoHideController,
    popupAppMenuController,
    setTitleBarColorsController,
  ] = createAppMenuControllers({
    setAppMenuUseCase,
    setAppMenuAutoHideUseCase,
    popupAppMenuUseCase,
    setTitleBarColorsUseCase,
  })

  return {
    setAppMenuUseCase,
    setAppMenuAutoHideUseCase,
    popupAppMenuUseCase,
    setTitleBarColorsUseCase,
    setAppMenuController,
    setAppMenuAutoHideController,
    popupAppMenuController,
    setTitleBarColorsController,
  }
}

describe('AppMenuControllers', () => {
  describe('SetAppMenuController', () => {
    it('should have a right channel name', () => {
      const { channel } = setup().setAppMenuController;

      expect(channel).toBe(ipcSetAppMenuChannel)
    })

    it('should call a right usecase with right params', () => {
      const webContents = { 'test': 'obj' } as unknown as WebContents;
      const testItems: MenuItemsIpc = [fixtureMenuItemIpcA(), fixtureMenuItemIpcB()];

      const { setAppMenuController, setAppMenuUseCase } = setup();
      const { handle } = setAppMenuController;
      const event = fixtureIpcMainEvent({
        sender: webContents
      });

      handle(event, testItems);

      expect(setAppMenuUseCase).toHaveBeenCalledTimes(1);
      expect(setAppMenuUseCase).toHaveBeenCalledWith(testItems, webContents);
    });
  })

  describe('SetAppMenuAutoHideController', () => {
    it('should have a right channel name', () => {
      const { channel } = setup().setAppMenuAutoHideController;

      expect(channel).toBe(ipcSetAppMenuAutoHideChannel)
    })

    it('should call a right usecase with right params', () => {
      const win = { 'test': 'obj' } as unknown as BrowserWindow;

      const { setAppMenuAutoHideController, setAppMenuAutoHideUseCase } = setup();
      const { handle } = setAppMenuAutoHideController;
      const event = fixtureIpcMainEvent({
        getSenderBrowserWindow: () => win
      });

      handle(event, true);

      expect(setAppMenuAutoHideUseCase).toHaveBeenCalledTimes(1);
      expect(setAppMenuAutoHideUseCase).toHaveBeenCalledWith(true, win);

      handle(event, false);

      expect(setAppMenuAutoHideUseCase).toHaveBeenNthCalledWith(2, false, win);
    });
  })

  describe('PopupAppMenuController and SetTitleBarColorsController', () => {
    it('pass the arguments and the sender window to their use cases', async () => {
      const win = { 'test': 'obj' } as unknown as BrowserWindow;
      const { popupAppMenuController, popupAppMenuUseCase, setTitleBarColorsController, setTitleBarColorsUseCase } = setup();
      const event = fixtureIpcMainEvent({ getSenderBrowserWindow: () => win });

      expect(popupAppMenuController.channel).toBe(ipcPopupAppMenuChannel);
      await popupAppMenuController.handle(event, 1, 10, 30);
      expect(popupAppMenuUseCase).toHaveBeenCalledWith(1, 10, 30, win);

      expect(setTitleBarColorsController.channel).toBe(ipcSetTitleBarColorsChannel);
      await setTitleBarColorsController.handle(event, '#282A36', '#F8F8F2');
      expect(setTitleBarColorsUseCase).toHaveBeenCalledWith('#282A36', '#F8F8F2', win);
    });
  })
})
