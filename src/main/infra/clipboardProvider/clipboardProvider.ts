/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import Electron from 'electron';
import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';

export function createClipboardProvider(): ClipboardProvider {
  return {
    writeBookmark: (title, url) => (process.platform === 'darwin' || process.platform === 'win32') ? Electron.clipboard.writeBookmark(title, url) : Electron.clipboard.writeText(url),
    writeText: (text) => Electron.clipboard.writeText(text),
    copyImageAt: (webContentsId, x, y) => {
      // `copyImageAt` exists on WebContents only, not on the <webview> tag, so the renderer passes the guest's id.
      // Only a webview guest: the id comes from the renderer, and the app page itself is not a page to copy from.
      const target = Electron.webContents.fromId(webContentsId);
      if (target && !target.isDestroyed() && target.getType() === 'webview') {
        target.copyImageAt(x, y);
      }
    }
  }
}
