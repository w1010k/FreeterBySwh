/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import {
  IpcPopupAppMenuArgs, ipcPopupAppMenuChannel, IpcPopupAppMenuRes, IpcSetAppMenuArgs, IpcSetAppMenuAutoHideArgs, ipcSetAppMenuAutoHideChannel,
  IpcSetAppMenuAutoHideRes, ipcSetAppMenuChannel, IpcSetAppMenuRes, IpcSetTitleBarColorsArgs, ipcSetTitleBarColorsChannel, IpcSetTitleBarColorsRes
} from '@common/ipc/channels';
import { SetAppMenuUseCase } from '@/application/useCases/appMenu/setAppMenu';
import { SetAppMenuAutoHideUseCase } from '@/application/useCases/appMenu/setAppMenuAutoHide';
import { PopupAppMenuUseCase } from '@/application/useCases/appMenu/popupAppMenu';
import { SetTitleBarColorsUseCase } from '@/application/useCases/appMenu/setTitleBarColors';

type Deps = {
  setAppMenuUseCase: SetAppMenuUseCase;
  setAppMenuAutoHideUseCase: SetAppMenuAutoHideUseCase;
  popupAppMenuUseCase: PopupAppMenuUseCase;
  setTitleBarColorsUseCase: SetTitleBarColorsUseCase;
}

export function createAppMenuControllers({
  setAppMenuUseCase,
  setAppMenuAutoHideUseCase,
  popupAppMenuUseCase,
  setTitleBarColorsUseCase,
}: Deps): [
    Controller<IpcSetAppMenuArgs, IpcSetAppMenuRes>,
    Controller<IpcSetAppMenuAutoHideArgs, IpcSetAppMenuAutoHideRes>,
    Controller<IpcPopupAppMenuArgs, IpcPopupAppMenuRes>,
    Controller<IpcSetTitleBarColorsArgs, IpcSetTitleBarColorsRes>,
  ] {
  return [{
    channel: ipcSetAppMenuChannel,
    handle: async (event, menuItemsIpc) => {
      const { sender } = event;
      setAppMenuUseCase(menuItemsIpc, sender);
    }
  }, {
    channel: ipcSetAppMenuAutoHideChannel,
    handle: async (event, autoHide) => {
      const win = event.getSenderBrowserWindow();
      if (win) {
        setAppMenuAutoHideUseCase(autoHide, win);
      }
    }
  }, {
    channel: ipcPopupAppMenuChannel,
    handle: async (event, index, x, y) => {
      const win = event.getSenderBrowserWindow();
      if (win) {
        await popupAppMenuUseCase(index, x, y, win);
      }
    }
  }, {
    channel: ipcSetTitleBarColorsChannel,
    handle: async (event, color, symbolColor) => {
      const win = event.getSenderBrowserWindow();
      if (win) {
        await setTitleBarColorsUseCase(color, symbolColor, win);
      }
    }
  }]
}
