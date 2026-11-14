/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {BrowserWindow} from '@/application/interfaces/browserWindow'
import {GetWindowStateUseCase} from '@/application/useCases/browserWindow/getWindowState';
import {SetWindowStateUseCase} from '@/application/useCases/browserWindow/setWindowState';
import {decideWindowOpen} from '@/infra/browserWindow/windowOpenPolicy';
import {decideGuestKey} from '@/infra/browserWindow/guestKeyPolicy';
import {
  ipcAppFocusChangedChannel,
  ipcGoHomeWebpageChannel,
  ipcSwitchWorkflowByOffsetChannel,
  ipcWebpageWindowBlockedChannel,
  IpcWebpageWindowBlockedReason,
  maxPopupsPerGuest,
  ipcZoomWebpageChannel
} from '@common/ipc/channels';
import {
  app,
  BrowserWindow as ElectronBrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  shell,
  webContents
} from 'electron';

import { appTitleBarHeight } from '@common/base/titleBar';
import { hasAppTitleBar } from '@/infra/browserWindow/appTitleBar';

const minWidth = 1200;
const minHeight = 600;

// Window title follows the app name so a run from the repo shows "(dev)" and
// can't be mistaken for the installed release (see app.setName in main/index).
const winTitle = () => app.getName();

const defaultWinParams = {
  width: 1200,
  height: 700,
}

// urls requiring the original user-agent
const reUrlsRequiringOriginalUA: RegExp[] = [
  /^https?:\/\/(?:[a-z0-9-_]*\.)+google.com\/?/i // Google Apps
]

// The Webpage widget webview a page belongs to: the webview itself, or the webview under which a popup was opened.
const guestIdOf = new WeakMap<Electron.WebContents, number>();
// The app page, which shows the notices.
let appPage: Electron.WebContents | null = null;
// Longer URLs (data:) are reported without the URL: the notice then has no button.
const maxReportedUrl = 32768;

/**
 * Tells the Webpage widget that a request of its page was not opened: a new window (decideWindowOpen) or an app link
 * the page navigated to (the session permission handler). Pages that are not a widget's are ignored.
 */
export function reportBlockedRequest(source: Electron.WebContents, url: string, reason: IpcWebpageWindowBlockedReason): void {
  const guestId = guestIdOf.get(source);
  if (guestId === undefined || !appPage || appPage.isDestroyed()) {
    return;
  }
  appPage.send(ipcWebpageWindowBlockedChannel, guestId, url.length > maxReportedUrl ? '' : url, reason);
}

// Title for an in-app popup: the origin of the page it shows, or the full URL
// when there is no real origin (about:blank, data:).
function popupTitle(url: string): string {
  try {
    const {origin} = new URL(url);
    return origin !== 'null' ? origin : url;
  } catch {
    return url || app.getName();
  }
}

function navigateHistory(target: Electron.WebContents, dir: 'back' | 'forward') {
  const nav = target.navigationHistory;
  if (dir === 'back' && nav.canGoBack()) {
    nav.goBack();
  } else if (dir === 'forward' && nav.canGoForward()) {
    nav.goForward();
  }
}

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
  const {getWindowStateUseCase, setWindowStateUseCase} = deps;
  const {h, w, x, y, isFull, isMaxi, isMini} = getWindowStateUseCase();
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
    title: winTitle(),
    minWidth,
    minHeight,
    // Windows, Linux: no OS title bar, so the app's title bar and menu bar take the theme colors (TitleBar component).
    // The OS still draws the window buttons over it; the page sets their colors (set-title-bar-colors) once the theme
    // is known. macOS keeps its title bar: the menu is at the top of the screen there.
    ...(hasAppTitleBar
      ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#F8F8F8', symbolColor: '#000000', height: appTitleBarHeight } }
      : {}),
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
    const {height, width, x, y} = win.getNormalBounds();
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
  if (!app.isPackaged) {
    // The renderer's <title> normally takes over the window title, which would
    // hide the "(dev)" marker. Pin it for repo runs only; the release keeps the
    // page-driven title exactly as before.
    win.on('page-title-updated', e => e.preventDefault());
  }

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

  // Foreground/background signal for local usage telemetry. Best-effort: if the
  // renderer isn't listening (telemetry off) it's simply ignored.
  win.on('focus', () => win.webContents.send(ipcAppFocusChangedChannel, true));
  win.on('blur', () => win.webContents.send(ipcAppFocusChangedChannel, false));

  // prevent leaving the app page (by dragging an image for example)
  win.webContents.on('will-navigate', evt => evt.preventDefault());
  // The app page never opens windows itself. Without this, a middle-click or
  // Shift+click on an in-app link would open a child window that inherits the
  // app's preload, i.e. a second page with full IPC access.
  appPage = win.webContents;
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));

  // set original user-agent for urls requiring it
  win.webContents.on('will-attach-webview', (_, wp, params) => {
    for (const re of reUrlsRequiringOriginalUA) {
      if (params.src.match(re)) {
        params.useragent = uaOriginal;
        break;
      }
    }
  })

  // New-window requests from a guest (a <webview>, or an in-app popup it opened) are decided by `decideWindowOpen`:
  // the default browser, an in-app popup, or blocked. Same-frame navigation (regular link clicks, JS redirects, form
  // submits, back/forward) bypasses this handler entirely and stays in the widget. Popups get the same handler, so a
  // nested window.open or target=_blank is routed the same way instead of opening more unmanaged windows.
  // `popups` is shared by a guest and every popup under it. `guestId` is the widget's webview: a blocked request is
  // reported to it (also from a popup), and the widget shows what happened.
  const attachWindowOpenHandler = (opener: Electron.WebContents, popups: {open: number}, guestId: number) => {
    opener.setWindowOpenHandler(({url, disposition, features}) => {
      const decision = decideWindowOpen({url, disposition, features, openPopups: popups.open, maxPopups: maxPopupsPerGuest});
      if (decision.kind === 'external') {
        shell.openExternal(decision.url);
        return {action: 'deny'};
      }
      if (decision.kind === 'blocked') {
        // The page sees `null` from window.open; without this the user saw nothing (or the page's own "pop-up blocked").
        // The widget decides from the URL's scheme whether its notice offers a button (windowBlockedEvents.ts).
        reportBlockedRequest(opener, url, decision.reason);
        return {action: 'deny'};
      }
      const {height, width, x, y} = win.getBounds();
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
        // An empty popup shows what its opener writes into it (same origin), so it carries the opener's origin, not
        // the app name: a page must not pass its content off as an app window.
        title: popupTitle(url === '' || url === 'about:blank' ? opener.getURL() : url),
        // Pinned explicitly instead of inherited from the opener, so a popup
        // never ends up with node, a preload or <webview> by accident.
        webPreferences: {
          session: opener.session,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false
        }
      };
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: browserWinOpts
      };
    });
    opener.on('did-create-window', (popup) => {
      popups.open++;
      guestIdOf.set(popup.webContents, guestId);
      popup.on('closed', () => { popups.open--; });
      // The popup has no address bar and carries the app icon, so its title shows
      // the site's origin and the page can't replace it. Otherwise a page could
      // pass off a fake sign-in form as an app dialog.
      popup.on('page-title-updated', evt => evt.preventDefault());
      popup.webContents.on('did-navigate', (_evt, navUrl) => {
        if (!popup.isDestroyed()) {
          popup.setTitle(popupTitle(navUrl));
        }
      });
      attachWindowOpenHandler(popup.webContents, popups, guestId);
    });
  };

  // Widget shortcuts in a <webview>: decideGuestKey tells which one a key is, and this runs it.
  win.webContents.on('did-attach-webview', (_, wc) => {
    wc.on('before-input-event', (event, input) => {
      const action = decideGuestKey(input, () => wc.getURL());
      if (!action) {
        return;
      }
      event.preventDefault();
      switch (action.kind) {
        case 'switchWorkflow':
          win.webContents.send(ipcSwitchWorkflowByOffsetChannel, action.offset);
          break;
        case 'history':
          // The widget's own `did-navigate` listener refreshes its action bar when the history moves.
          navigateHistory(wc, action.dir);
          break;
        case 'goHome':
          // The matching webview (by webContentsId) loads its own start page URL.
          win.webContents.send(ipcGoHomeWebpageChannel, wc.id);
          break;
        case 'reload':
          wc.reload();
          break;
        case 'openInBrowser':
          if (action.url) {
            shell.openExternal(action.url);
          }
          break;
        case 'zoom':
          win.webContents.send(ipcZoomWebpageChannel, wc.id, action.direction);
          break;
        default: {
          // A new GuestKeyAction kind without a case here fails the type check, instead of swallowing the key.
          const unhandled: never = action;
          throw new Error(`Unhandled guest key action: ${JSON.stringify(unhandled)}`);
        }
      }
    });

    guestIdOf.set(wc, wc.id);
    attachWindowOpenHandler(wc, {open: 0}, wc.id);
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
    navigateHistory(target, dir);
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
