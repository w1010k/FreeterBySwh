/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { BrowserWindowConstructorOptions, BrowserWindow as ElectronBrowserWindow, app, screen, shell, webContents } from 'electron';
import { BrowserWindow } from '@/application/interfaces/browserWindow'
import { GetWindowStateUseCase } from '@/application/useCases/browserWindow/getWindowState';
import { SetWindowStateUseCase } from '@/application/useCases/browserWindow/setWindowState';
import { ipcSwitchWorkflowByOffsetChannel } from '@common/ipc/channels';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';

const minWidth = 1200;
const minHeight = 600;

const defaultWinParams = {
  width: 1200,
  height: 700,
}

// urls requiring the original user-agent
const reUrlsRequiringOriginalUA: RegExp[] = [
  /^https?:\/\/(?:[a-z0-9-_]*\.)+google.com\/?/i // Google Apps
]

const rePopupFeatures = /\bpopup\b/i;

/**
 * BrowserWindow factory
 *
 * Should be called **in `app.whenReady().then(...)`**
 */
export function createRendererWindow(
  preload: string,
  url: string,
  icon: string | undefined,
  uaOriginal: string,
  deps: {
    getWindowStateUseCase: GetWindowStateUseCase,
    setWindowStateUseCase: SetWindowStateUseCase,
  },
  opts: {
    devTools?: boolean,
  }
): BrowserWindow {
  const { getWindowStateUseCase, setWindowStateUseCase } = deps;
  const { h, w, x, y, isFull, isMaxi, isMini } = getWindowStateUseCase();
  const setDefaultValues = h < minHeight || w < minWidth;

  const win = new ElectronBrowserWindow({
    ...(setDefaultValues
      ? defaultWinParams
      : {
        width: w,
        height: h,
        x,
        y
      }
    ),
    icon,
    title: 'Freeter',
    minWidth,
    minHeight,
    webPreferences: {
      // (SECURITY) Disable access to NodeJS in Renderer
      nodeIntegration: false,
      // (SECURITY) Isolate global objects in preload script
      contextIsolation: true,
      webSecurity: true,
      preload,
      webviewTag: true,
    }
  });
  if (isMaxi) {
    win.maximize();
  }
  if (isFull) {
    win.setFullScreen(true)
  }
  if (isMini) {
    win.minimize();
  }

  function winStateUpdateHandler() {
    const { height, width, x, y } = win.getNormalBounds();
    setWindowStateUseCase({
      x,
      y,
      w: width,
      h: height,
      isFull: win.isFullScreen(),
      isMini: win.isMinimized(),
      isMaxi: win.isMaximized()
    })
  }

  let isQuittingApp = false;
  app.on('before-quit', () => {
    isQuittingApp = true;
  });
  win.on('close', e => {
    if (!isQuittingApp) {
      // Hide, don't close
      win.hide();
      e.preventDefault();
    }
  });

  win.on('resize', winStateUpdateHandler);
  win.on('move', winStateUpdateHandler);
  win.on('minimize', winStateUpdateHandler);
  win.on('restore', winStateUpdateHandler);
  win.on('maximize', winStateUpdateHandler);
  win.on('unmaximize', winStateUpdateHandler);
  win.on('enter-full-screen', winStateUpdateHandler);
  win.on('leave-full-screen', winStateUpdateHandler);

  // prevent leaving the app page (by dragging an image for example)
  win.webContents.on('will-navigate', evt => evt.preventDefault());

  // set original user-agent for urls requiring it
  win.webContents.on('will-attach-webview', (_, wp, params) => {
    for (const re of reUrlsRequiringOriginalUA) {
      if (params.src.match(re)) {
        params.useragent = uaOriginal;
        break;
      }
    }
  })

  // Split new-window requests from <webview> into two branches:
  //   - "new tab" intents (`<a target="_blank">`, plain `window.open(url)`,
  //     middle-click, Ctrl/Cmd+click) → send to the user's default browser so
  //     Freeter doesn't swallow links meant to "escape" the widget.
  //   - real popups (`window.open(url, '', 'popup,width=X,height=Y')`,
  //     disposition 'new-window') → keep as an in-app BrowserWindow. OAuth
  //     / login flows rely on `window.opener.postMessage(...)` to return the
  //     result to the opener, which only works when both live in the same
  //     Electron process.
  // Same-frame navigation (regular link clicks, JS redirects, form submits,
  // back/forward) bypasses this handler entirely and stays in the widget.
  // Menu accelerators (e.g. Ctrl+Tab for workflow switching) don't reach the
  // host window when a <webview> has keyboard focus — the webview's guest page
  // consumes the key first. Mirror the Ctrl+Tab / Ctrl+Shift+Tab shortcuts at
  // the webview level so workflow switching keeps working while the user is
  // interacting with a webpage widget.
  win.webContents.on('did-attach-webview', (_, wc) => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'Tab') {
        return;
      }
      if (!input.control || input.alt || input.meta) {
        return;
      }
      event.preventDefault();
      win.webContents.send(ipcSwitchWorkflowByOffsetChannel, input.shift ? -1 : 1);
    });

    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      const isRealPopup = disposition === 'new-window' || rePopupFeatures.test(features);
      if (!isRealPopup) {
        const sanitUrl = sanitizeUrl(url);
        if (sanitUrl) {
          shell.openExternal(sanitUrl);
        }
        return { action: 'deny' };
      }
      const { height, width, x, y } = win.getBounds();
      const newW = width - 200;
      const newH = height - 150;
      const newX = x + Math.round((width - newW) / 2);
      const newY = y + Math.round((height - newH) / 2);
      const browserWinOpts: BrowserWindowConstructorOptions = {
        width: newW,
        height: newH,
        x: newX,
        y: newY,
        minimizable: false,
        icon,
        parent: win,
        title: 'Freeter',
        webPreferences: {
          session: wc.session
        }
      };
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: browserWinOpts
      };
    })
  })

  // Route mouse back/forward buttons to the <webview> directly under the cursor.
  // We can't rely on `isFocused()` because keyboard focus often stays on a
  // previously-clicked webview even after the user switches widgets, and side-
  // button presses themselves don't move focus. The cursor position matches
  // user intent more reliably.
  const navigateWebviewUnderCursor = async (dir: 'back' | 'forward') => {
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    const localX = cursor.x - bounds.x;
    const localY = cursor.y - bounds.y;
    if (localX < 0 || localY < 0 || localX >= bounds.width || localY >= bounds.height) {
      return;
    }
    let webContentsId: unknown;
    try {
      webContentsId = await win.webContents.executeJavaScript(
        `(() => { const el = document.elementFromPoint(${localX}, ${localY});
          const wv = el && el.closest ? el.closest('webview') : null;
          return wv ? wv.getWebContentsId() : null; })()`
      );
    } catch {
      // Renderer may be reloading or the window is closing; navigation is a
      // best-effort user action, so silently skip rather than crash main.
      return;
    }
    if (typeof webContentsId !== 'number') {
      return;
    }
    const target = webContents.fromId(webContentsId);
    if (!target || target.isDestroyed() || target.getType() !== 'webview') {
      return;
    }
    const nav = target.navigationHistory;
    if (dir === 'back' && nav.canGoBack()) {
      nav.goBack();
    } else if (dir === 'forward' && nav.canGoForward()) {
      nav.goForward();
    }
  };

  // Covers Linux XF86Back/Forward and well-behaved Windows setups that deliver
  // WM_APPCOMMAND (APPCOMMAND_BROWSER_BACKWARD/FORWARD).
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') {
      navigateWebviewUnderCursor('back');
    } else if (cmd === 'browser-forward') {
      navigateWebviewUnderCursor('forward');
    }
  });

  // Many Windows mouse drivers don't translate X1/X2 side buttons into
  // WM_APPCOMMAND, so hook the raw WM_XBUTTONUP message as a fallback.
  if (process.platform === 'win32') {
    const WM_XBUTTONUP = 0x020C;
    const XBUTTON1 = 1; // back
    const XBUTTON2 = 2; // forward
    win.hookWindowMessage(WM_XBUTTONUP, (wParam) => {
      const whichButton = wParam.readUInt16LE(2); // HIWORD of wParam
      if (whichButton === XBUTTON1) {
        navigateWebviewUnderCursor('back');
      } else if (whichButton === XBUTTON2) {
        navigateWebviewUnderCursor('forward');
      }
    });
  }

  // and load the index.html of the app.
  win.loadURL(url);
  if (opts.devTools) {
    win.webContents.openDevTools();
  }

  return win;
}
