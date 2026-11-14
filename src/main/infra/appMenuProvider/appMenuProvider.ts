/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import Electron from 'electron';
import { AppMenuProvider } from '@/application/interfaces/appMenuProvider';
import { createElectronMenuFromMenuItemsIpc } from '@/infra/utils/menu';
import { IpcClickAppMenuActionArgs, ipcClickAppMenuActionChannel } from '@common/ipc/channels';
import { hasAppTitleBar } from '@/infra/browserWindow/appTitleBar';

export function createAppMenuProvider(): AppMenuProvider {
  Electron.Menu.setApplicationMenu(null); // reset the default Electron menu

  return {
    setMenu: (items, actionsTarget) => Electron.Menu.setApplicationMenu(
      items.length > 0
        ? createElectronMenuFromMenuItemsIpc(items, actionId => {
          type ElectronSend = typeof actionsTarget.send;
          type SendIpcClickAppMenuAction = (channel: Parameters<ElectronSend>[0], ...args: IpcClickAppMenuActionArgs) => void;
          (<SendIpcClickAppMenuAction>actionsTarget.send)(ipcClickAppMenuActionChannel, actionId);
        })
        : null
    ),
    setAutoHide: (autoHide, windowTarget) => {
      const isVisible = !autoHide;
      const _win = windowTarget as unknown as Electron.BrowserWindow;
      if (hasAppTitleBar) {
        // The window has no OS title bar (titleBarStyle 'hidden'): the app draws its own menu bar and hides it itself.
        // An auto-hidden native bar would come back on Alt.
        _win.setAutoHideMenuBar(false);
        return;
      }
      _win.setAutoHideMenuBar(!isVisible);
      _win.setMenuBarVisibility(isVisible);
    },
    popup: (index, x, y, windowTarget) => new Promise<void>(resolve => {
      const submenu = Electron.Menu.getApplicationMenu()?.items[index]?.submenu;
      if (!submenu) {
        resolve();
        return;
      }
      submenu.popup({ window: windowTarget as unknown as Electron.BrowserWindow, x, y, callback: () => resolve() });
    }),
    setTitleBarColors: (color, symbolColor, windowTarget) => {
      if (hasAppTitleBar) {
        (windowTarget as unknown as Electron.BrowserWindow).setTitleBarOverlay({ color, symbolColor });
      }
    }
  }
}
