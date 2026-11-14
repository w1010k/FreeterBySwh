/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { MenuItems } from '@common/base/menu';

export interface AppMenuProvider {
  setMenu: (items: MenuItems) => Promise<void>;
  setAutoHide: (autoHide: boolean) => Promise<void>;
  /** Opens the top-level menu at `index` at x, y of the page. Resolves when the menu closes. */
  popup: (index: number, x: number, y: number) => Promise<void>;
  /** Colors of the window buttons the OS draws over the app's title bar. */
  setTitleBarColors: (color: string, symbolColor: string) => Promise<void>;
}
