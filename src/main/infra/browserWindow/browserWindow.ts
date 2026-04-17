/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { BrowserWindow as ElectronBrowserWindow, app, shell, webContents } from 'electron';
import { BrowserWindow } from '@/application/interfaces/browserWindow'
import { GetWindowStateUseCase } from '@/application/useCases/browserWindow/getWindowState';
import { SetWindowStateUseCase } from '@/application/useCases/browserWindow/setWindowState';

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

  // Behave like a single-tab browser inside the widget:
  //   - `<a target="_blank">` / "new tab" intents → navigate the current webview
  //   - real popups (`window.open` with size/popup features, disposition 'new-window') → OS browser
  win.webContents.on('did-attach-webview', (_, wc) => {
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      const isRealPopup = disposition === 'new-window' || /\bpopup\b/i.test(features);
      if (isRealPopup) {
        shell.openExternal(url);
      } else {
        wc.loadURL(url);
      }
      return { action: 'deny' };
    })
  })

  // Route mouse back/forward buttons to a <webview>'s navigation history.
  // Side-button presses don't change focus, so we look for the focused webview
  // first, and fall back to the only webview when there is exactly one.
  const navigateFocusedWebview = (dir: 'back' | 'forward') => {
    const webviews = webContents.getAllWebContents()
      .filter(wc => wc.getType() === 'webview' && !wc.isDestroyed());
    const target = webviews.find(wc => wc.isFocused())
      ?? (webviews.length === 1 ? webviews[0] : undefined);
    if (!target) {
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
      navigateFocusedWebview('back');
    } else if (cmd === 'browser-forward') {
      navigateFocusedWebview('forward');
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
        navigateFocusedWebview('back');
      } else if (whichButton === XBUTTON2) {
        navigateFocusedWebview('forward');
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
