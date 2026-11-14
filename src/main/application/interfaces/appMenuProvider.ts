/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { MenuItemsIpc } from '@common/base/menu';
import { WebContents } from '@/application/interfaces/webContents';
import { BrowserWindow } from '@/application/interfaces/browserWindow';

export interface AppMenuProvider {
  setMenu: (items: MenuItemsIpc, actionsTarget: WebContents) => void
  setAutoHide: (autoHide: boolean, windowTarget: BrowserWindow) => void
  /** Opens the top-level menu at `index` at x, y of the window's page. Resolves when the menu closes. */
  popup: (index: number, x: number, y: number, windowTarget: BrowserWindow) => Promise<void>
  /** Colors of the window buttons over the app's title bar (no-op where the OS draws a title bar: macOS). */
  setTitleBarColors: (color: string, symbolColor: string, windowTarget: BrowserWindow) => void
}
