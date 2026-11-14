/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isAllowedExternalUrl } from '@common/helpers/isAllowedExternalUrl';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { IpcZoomWebpageDirection } from '@common/ipc/channels';

export type GuestKeyInput = Pick<Electron.Input, 'type' | 'key' | 'code' | 'control' | 'alt' | 'meta' | 'shift'>;

export type GuestKeyAction =
  /** Switch to the next (1) or previous (-1) workflow. */
  | { kind: 'switchWorkflow'; offset: 1 | -1 }
  /** Move the webview's history. */
  | { kind: 'history'; dir: 'back' | 'forward' }
  /** Load the widget's start page (the URL lives in renderer-side settings). */
  | { kind: 'goHome' }
  /** Reload the webview, keeping zoom. */
  | { kind: 'reload' }
  /** Open the current page in the default browser; `null` swallows the key without opening anything. */
  | { kind: 'openInBrowser'; url: string | null }
  /** Zoom the webview (the zoom factor lives in the renderer). */
  | { kind: 'zoom'; direction: IpcZoomWebpageDirection };

/**
 * The widget shortcut a key press in a Webpage widget's <webview> stands for, or `null` to leave the key to the page.
 * Menu accelerators don't reach the host window while a <webview> has keyboard focus (the guest page consumes the key
 * first), so these are caught in main's `before-input-event` (D21). Every non-null action consumes the key.
 * `getUrl` is called only for CmdOrCtrl+T.
 */
export function decideGuestKey(input: GuestKeyInput, getUrl: () => string): GuestKeyAction | null {
  if (input.type !== 'keyDown') {
    return null;
  }
  // Ctrl+Tab / Ctrl+Shift+Tab: workflow switching (Ctrl only, not Cmd, to keep macOS Cmd+Tab as the OS app switcher).
  if (input.key === 'Tab' && input.control && !input.alt && !input.meta) {
    return { kind: 'switchWorkflow', offset: input.shift ? -1 : 1 };
  }
  // Alt+Left / Alt+Right: history back/forward. Chromium's default Alt+Arrow mapping inside an embedded <webview> is
  // inconsistent (OS and page focus dependent), so it is bound explicitly.
  // Alt+Home: the widget's start page.
  if (input.alt && !input.control && !input.meta && !input.shift) {
    if (input.key === 'ArrowLeft') {
      return { kind: 'history', dir: 'back' };
    }
    if (input.key === 'ArrowRight') {
      return { kind: 'history', dir: 'forward' };
    }
    if (input.key === 'Home') {
      return { kind: 'goHome' };
    }
  }
  // F5: reload, keeping zoom like real browsers. The action bar's Reload button also resets zoom (D24). Checked before
  // the primary-modifier guard below because F5 carries no Ctrl/Cmd.
  if (input.key === 'F5' && !input.control && !input.meta && !input.alt && !input.shift) {
    return { kind: 'reload' };
  }
  const primaryMod = input.control || input.meta;
  if (!primaryMod || input.alt) {
    return null;
  }
  // CmdOrCtrl+T: open the current page in the default browser. Productivity apps leave Ctrl+T unbound because real
  // browsers own it for "new tab" (D23). `.code` instead of `.key` so Caps Lock and non-QWERTY layouts still match.
  if (input.code === 'KeyT' && !input.shift) {
    const currentUrl = getUrl();
    const safeUrl = currentUrl ? sanitizeUrl(currentUrl) : '';
    // The guest page controls its own URL, so only web and mail schemes reach the OS (a file: or app-protocol URL
    // would launch something). A refused URL is dropped silently, unlike a refused new window (D58, D81).
    return { kind: 'openInBrowser', url: safeUrl && isAllowedExternalUrl(safeUrl) ? safeUrl : null };
  }
  // CmdOrCtrl+R: reload, keeping zoom. Shift excluded so Ctrl+Shift+R stays free.
  if (input.code === 'KeyR' && !input.shift) {
    return { kind: 'reload' };
  }
  // CmdOrCtrl+Shift+= (`+`) / CmdOrCtrl+- / CmdOrCtrl+0: page zoom. Only `+` zooms in (Shift is always pressed):
  // `before-input-event` doesn't reliably deliver the bare `=` key (observed on Windows with some layouts and IMEs).
  // Requiring Shift matches Chrome's `Cmd+Shift+=` accelerator.
  if (input.key === '+') {
    return { kind: 'zoom', direction: 'in' };
  }
  if (input.key === '-') {
    return { kind: 'zoom', direction: 'out' };
  }
  if (input.key === '0') {
    return { kind: 'zoom', direction: 'reset' };
  }
  return null;
}
