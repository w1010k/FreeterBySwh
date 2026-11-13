/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface ClipboardProvider {
  writeBookmark: (title: string, url: string) => void;
  writeText: (text: string) => void;
  /** Copies the image at (x, y) of a webview's page, as the page shows it. Does nothing for any other web contents. */
  copyImageAt: (webContentsId: number, x: number, y: number) => void;
}
