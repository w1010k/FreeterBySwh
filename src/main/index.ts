/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {BrowserWindow} from '@/application/interfaces/browserWindow';
import {createOsActivityMonitor} from '@/application/osActivity/osActivityMonitor';
import {createGetTextFromAppDataStorageUseCase} from '@/application/useCases/appDataStorage/getTextFromAppDataStorage';
import {createSetTextInAppDataStorageUseCase} from '@/application/useCases/appDataStorage/setTextInAppDataStorage';
import {createSetAppMenuUseCase} from '@/application/useCases/appMenu/setAppMenu';
import {createSetAppMenuAutoHideUseCase} from '@/application/useCases/appMenu/setAppMenuAutoHide';
import {createGetWindowStateUseCase} from '@/application/useCases/browserWindow/getWindowState';
import {createSetWindowStateUseCase} from '@/application/useCases/browserWindow/setWindowState';
import {createShowBrowserWindowUseCase} from '@/application/useCases/browserWindow/showBrowserWindow';
import {createWriteBookmarkIntoClipboardUseCase} from '@/application/useCases/clipboard/writeBookmarkIntoClipboard';
import {createWriteTextIntoClipboardUseCase} from '@/application/useCases/clipboard/writeTextIntoClipboard';
import {createPopupContextMenuUseCase} from '@/application/useCases/contextMenu/popupContextMenu';
import {createShowMessageBoxUseCase} from '@/application/useCases/dialog/showMessageBox';
import {createShowOpenDirDialogUseCase} from '@/application/useCases/dialog/showOpenDirDialog';
import {createShowOpenFileDialogUseCase} from '@/application/useCases/dialog/showOpenFileDialog';
import {createShowSaveFileDialogUseCase} from '@/application/useCases/dialog/showSaveFileDialog';
import {createSetDownloadDirUseCase} from '@/application/useCases/download/setDownloadDir';
import {createGetHomeDirUseCase} from '@/application/useCases/fs/getHomeDir';
import {createGetImageDataUrlUseCase} from '@/application/useCases/fs/getImageDataUrl';
import {createReadDirUseCase} from '@/application/useCases/fs/readDir';
import {createSearchFilesUseCase} from '@/application/useCases/fs/searchFiles';
import {createSetMainShortcutUseCase} from '@/application/useCases/globalShortcut/setMainShortcut';
import {createGetFaviconUseCase} from '@/application/useCases/icon/getFavicon';
import {createGetFileIconUseCase} from '@/application/useCases/icon/getFileIcon';
import {createSetOsMonitoringUseCase} from '@/application/useCases/osActivity/setOsMonitoring';
import {createOpenAnalyticsInBrowserUseCase} from '@/application/useCases/analytics/openAnalyticsInBrowser';
import {createGetProcessInfoUseCase} from '@/application/useCases/process/getProcessInfo';
import {createClearSharedDataStorageUseCase} from '@/application/useCases/sharedDataStorage/clearSharedDataStorage';
import {
  createDeleteInSharedDataStorageUseCase
} from '@/application/useCases/sharedDataStorage/deleteInSharedDataStorage';
import {
  createGetKeysFromSharedDataStorageUseCase
} from '@/application/useCases/sharedDataStorage/getKeysFromSharedDataStorage';
import {
  createGetTextFromSharedDataStorageUseCase
} from '@/application/useCases/sharedDataStorage/getTextFromSharedDataStorage';
import {
  createSetTextInSharedDataStorageUseCase
} from '@/application/useCases/sharedDataStorage/setTextInSharedDataStorage';
import {createOpenAppUseCase} from '@/application/useCases/shell/openApp';
import {createOpenAppDataDirUseCase} from '@/application/useCases/shell/openAppDataDir';
import {createOpenExternalUrlUseCase} from '@/application/useCases/shell/openExternalUrl';
import {createOpenPathUseCase} from '@/application/useCases/shell/openPath';
import {createGetSystemStatsUseCase} from '@/application/useCases/systemStats/getSystemStats';
import {
  createClearTelemetryDataStorageUseCase
} from '@/application/useCases/telemetryDataStorage/clearTelemetryDataStorage';
import {
  createDeleteInTelemetryDataStorageUseCase
} from '@/application/useCases/telemetryDataStorage/deleteInTelemetryDataStorage';
import {
  createGetKeysFromTelemetryDataStorageUseCase
} from '@/application/useCases/telemetryDataStorage/getKeysFromTelemetryDataStorage';
import {
  createGetTextFromTelemetryDataStorageUseCase
} from '@/application/useCases/telemetryDataStorage/getTextFromTelemetryDataStorage';
import {
  createSetTextInTelemetryDataStorageUseCase
} from '@/application/useCases/telemetryDataStorage/setTextInTelemetryDataStorage';
import {createExecCmdLinesInTerminalUseCase} from '@/application/useCases/terminal/execCmdLinesInTerminal';
import {createTranslateTextsUseCase} from '@/application/useCases/translate/translateTexts';
import {createInitTrayUseCase} from '@/application/useCases/tray/initTray';
import {createSetTrayMenuUseCase} from '@/application/useCases/tray/setTrayMenu';
import {createClearWidgetDataStorageUseCase} from '@/application/useCases/widgetDataStorage/clearWidgetDataStorage';
import {createCopyWidgetDataStorageUseCase} from '@/application/useCases/widgetDataStorage/copyWidgetDataStorage';
import {
  createDeleteInWidgetDataStorageUseCase
} from '@/application/useCases/widgetDataStorage/deleteInWidgetDataStorage';
import {
  createGetKeysFromWidgetDataStorageUseCase
} from '@/application/useCases/widgetDataStorage/getKeysFromWidgetDataStorage';
import {
  createGetTextFromWidgetDataStorageUseCase
} from '@/application/useCases/widgetDataStorage/getTextFromWidgetDataStorage';
import {
  createSetTextInWidgetDataStorageUseCase
} from '@/application/useCases/widgetDataStorage/setTextInWidgetDataStorage';
import {createAppDataStorageControllers} from '@/controllers/appDataStorage';
import {createAppMenuControllers} from '@/controllers/appMenu';
import {createBrowserWindowControllers} from '@/controllers/browserWindow';
import {createClipboardControllers} from '@/controllers/clipboard';
import {createContextMenuControllers} from '@/controllers/contextMenu';
import {registerControllers} from '@/controllers/controller';
import {createDialogControllers} from '@/controllers/dialog';
import {createDownloadControllers} from '@/controllers/download';
import {createFsControllers} from '@/controllers/fs';
import {createGlobalShortcutControllers} from '@/controllers/globalShortcut';
import {createIconControllers} from '@/controllers/icon';
import {createOsActivityControllers} from '@/controllers/osActivity';
import {createAnalyticsControllers} from '@/controllers/analytics';
import {createProcessControllers} from '@/controllers/process';
import {createSharedDataStorageControllers} from '@/controllers/sharedDataStorage';
import {createShellControllers} from '@/controllers/shell';
import {createSystemStatsControllers} from '@/controllers/systemStats';
import {createTelemetryDataStorageControllers} from '@/controllers/telemetryDataStorage';
import {createTerminalControllers} from '@/controllers/terminal';
import {createTranslateControllers} from '@/controllers/translate';
import {createTrayMenuControllers} from '@/controllers/trayMenu';
import {createWidgetDataStorageControllers} from '@/controllers/widgetDataStorage';
import {createWindowStateStorage} from '@/data/windowStateStorage';
import {createWindowStore} from '@/data/windowStore';
import {createAppMenuProvider} from '@/infra/appMenuProvider/appMenuProvider';
import {createAppsProvider} from '@/infra/appsProvider/appsProvider';
import {createRendererWindow} from '@/infra/browserWindow/browserWindow';
import {createChildProcessProvider} from '@/infra/childProcessProvider/childProcessProvider';
import {createClipboardProvider} from '@/infra/clipboardProvider/clipboardProvider';
import {createContextMenuProvider} from '@/infra/contextMenuProvider/contextMenuProvider';
import {copyFileDataStorage, createFileDataStorage} from '@/infra/dataStorage/fileDataStorage';
import {createDialogProvider} from '@/infra/dialogProvider/dialogProvider';
import {createDownloadManager} from '@/infra/downloads/downloadManager';
import {createFsProvider} from '@/infra/fsProvider/fsProvider';
import {createGlobalShortcutProvider} from '@/infra/globalShortcut/globalShortcutProvider';
import {registerHttpAuthHandler} from '@/infra/httpAuth/httpAuth';
import {createIconProvider} from '@/infra/iconProvider/iconProvider';
import {createIpcMain} from '@/infra/ipcMain/ipcMain';
import {createIpcMainEventValidator} from '@/infra/ipcMain/ipcMainEventValidator';
import {registerPermissionHandler} from '@/infra/permissions/permissionHandler';
import {createForegroundWindowReader} from '@/infra/osActivity/foregroundWindow';
import {createAnalyticsServer} from '@/infra/analyticsServer/analyticsServer';
import {createProcessProvider} from '@/infra/processProvider/processProvider';
import {registerAppFileProtocol} from '@/infra/protocolHandler/registerAppFileProtocol';
import {createShellProvider} from '@/infra/shellProvider/shellProvider';
import {createSystemStatsProvider} from '@/infra/systemStatsProvider/systemStatsProvider';
import {createTranslateProvider} from '@/infra/translateProvider/translateProvider';
import {createTrayProvider} from '@/infra/trayProvider/trayProvider';
import {createObjectManager} from '@common/base/objectManager';
import {parseSharedStorageId} from '@common/base/sharedStorageId';
import {setTextOnlyIfChanged} from '@common/infra/dataStorage/setTextOnlyIfChanged';
import {withJson} from '@common/infra/dataStorage/withJson';
import {hostFreeterApp, schemeFreeterFile} from '@common/infra/network';
import {ipcOsActivityEventChannel} from '@common/ipc/channels';
import {channelPrefix} from '@common/ipc/ipc';
import {app, BrowserWindow as ElectronBrowserWindow, dialog as electronDialog, net, powerMonitor} from 'electron';
import {delimiter as pathDelimiter, join} from 'node:path';
import type * as NodePty from 'node-pty';
import {createTerminalHost, prependPath} from '@/application/terminal/terminalHost';
import {createPtyControllers, createPtyInputListener} from '@/controllers/pty';
import {createHeadlessMirror} from '@/infra/terminal/headlessMirror';
import {randomBytes, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {existsSync, readFileSync} from 'node:fs';
import {detectShells} from '@/infra/terminal/detectShells';
import {ShellOption} from '@common/ipc/channels';
import {expandEnvVars, mergePath, parseRegPath} from '@/infra/env/windowsPath';
import {closeAiWhenAppPageGoes, createAiActionBridge} from '@/application/ai/aiActionBridge';
import {createConfirmAiActionUseCase} from '@/application/useCases/ai/confirmAiAction';
import {createAiControllers} from '@/controllers/ai';
import {createAiControlServer} from '@/infra/aiControlServer/aiControlServer';
import {getAiPipePath, removeAiEndpointSync, writeAiEndpoint} from '@/infra/aiControlServer/endpoint';
import {ipcAiActionRequestChannel, ipcPtyDataChannel, ipcPtyExitChannel, ipcPtyTitleChannel} from '@common/ipc/channels';

let appWindow: BrowserWindow | null = null; // ref to the app window

/**
 * Pushes a message to the app page only. Other windows (in-app popups opened by
 * web pages, the HTTP auth prompt) must not receive app data such as other apps'
 * window titles. `appWindow` is typed by the narrow app interface, so the Electron
 * window is found by identity, as 'browser-window-created' below does.
 */
function sendToAppWindow(channel: string, ...args: unknown[]): boolean {
  const win = ElectronBrowserWindow.getAllWindows().find(w => w === appWindow);
  if (!win || win.isDestroyed()) {
    return false;
  }
  // The window can be torn down between the check and send.
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch { /* window gone */
    return false;
  }
}

/**
 * Everything run straight from the repo (`yarn dev`, `yarn prod:run`) is kept
 * fully apart from an installed release: its own data folder, its own session
 * and its own single-instance lock. `app.isPackaged` is the right test — a
 * production build launched from the repo is still not the installed app.
 *
 * The suffix is mandatory, not cosmetic: unpackaged Electron derives userData
 * from package.json `name` ("freeter-swh") and the installer from productName
 * ("Freeter-SWH"), and Windows paths are case-insensitive, so without it both
 * land in the same folder and fight over the same lock.
 */
const dataDirName = app.isPackaged ? 'freeter-swh' : 'freeter-swh-dev';
if (!app.isPackaged) {
  // Only the repo run is redirected; the installed release keeps whatever
  // userData Electron already gave it, so no existing install is migrated.
  // Must run before the lock is requested: the lock lives inside userData, and
  // that is what scopes it per variant (two dev instances still block each other).
  app.setPath('userData', join(app.getPath('appData'), dataDirName));
  // Marks the dev window and its taskbar entry so it can't be mistaken for the
  // installed app. After setPath, since setName also feeds the default userData.
  app.setName('Freeter-SWH (dev)');
}

if (!app.requestSingleInstanceLock()) {
  // there is another instance of the app running. quit() is async, so the
  // `else` keeps this process from registering handlers, opening storage and
  // creating a tray/window against the running instance's data meanwhile.
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory, _additionalData) => {
    if (appWindow) {
      if (!appWindow.isVisible()) {
        appWindow.show();
      }
      if (appWindow.isMinimized()) {
        appWindow.restore()
      }
      appWindow.focus()
    }
  })

  const globalShortcutProvider = createGlobalShortcutProvider();

  // Set once the window store is created; flushed on quit so a pending (debounced)
  // window position/size save isn't lost. Best-effort: the underlying disk write is
  // async and not awaited, but flushing here shrinks the loss window from the
  // debounce delay (~5s) to a few ms.
  let flushWindowStore: (() => void) | undefined;

  // Set after the OS activity monitor is created; stopped on quit so the
  // long-lived PowerShell foreground-window reader isn't left orphaned (Windows
  // does not auto-kill child processes when the parent exits).
  let stopOsMonitor: (() => void) | undefined;

  // Set after the analytics server is created; stopped on quit so its loopback
  // port is released with the app.
  let stopAnalyticsServer: (() => void) | undefined;

  // Set after the AI control server starts; on quit it closes the pipe and
  // removes ai/endpoint.json so the `freeter` CLI reports "not running".
  let stopAiControl: (() => void) | undefined;

  // Set after the terminal host is created; on quit it ends the in-app terminals' shells.
  let stopTerminals: (() => void) | undefined;

  const processProvider = createProcessProvider();
  const processInfo = processProvider.getProcessInfo();
  const {isDevMode} = processInfo;

  registerAppFileProtocol(isDevMode);

  // Rebuild userAgentFallback as a plain Chrome UA. The default Electron UA
  // includes the app name token (e.g. `Freeter-SWH/...`) which many sites treat
  // as "unknown browser" and refuse to grant a persistent session.
  //
  // `uaOriginal` is captured before the overwrite because a handful of sites
  // (Google Apps, see `reUrlsRequiringOriginalUA` in browserWindow.ts) need the
  // raw Electron UA to work correctly.
  const uaOriginal = app.userAgentFallback;
  const chromeMajor = process.versions.chrome.split('.')[0];
  const platformSlug = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'linux'
      ? 'X11; Linux x86_64'
      : 'Windows NT 10.0; Win64; x64';
  app.userAgentFallback =
    `Mozilla/5.0 (${platformSlug}) AppleWebKit/537.36 (KHTML, like Gecko) `
    + `Chrome/${chromeMajor}.0.0.0 Safari/537.36`;

  app.on('will-quit', () => {
    // Persist any pending (debounced) window state before exiting.
    flushWindowStore?.();
    // Stop the OS activity monitor (kills its PowerShell child process).
    stopOsMonitor?.();
    // Close the local Analytics page server.
    stopAnalyticsServer?.();
    // Close the AI control pipe and remove its endpoint file.
    stopAiControl?.();
    stopTerminals?.();
    // Unregister global shortcuts
    globalShortcutProvider.destroy();
  })

  app.whenReady().then(async () => {
    const ipcMainEventValidator = createIpcMainEventValidator(channelPrefix, hostFreeterApp, schemeFreeterFile);
    const ipcMain = createIpcMain(ipcMainEventValidator);

    // Route downloads (app window + every webview partition) to a folder instead
    // of prompting each time. Created before any window/webview so its
    // session-created listener catches partition sessions. Default = OS Downloads;
    // the renderer pushes the configured override via the download controller.
    const downloadManager = createDownloadManager();
    const setDownloadDirUseCase = createSetDownloadDirUseCase({downloadManager});

    // Prompt for credentials on HTTP Basic/Digest auth challenges from any
    // webview; without this Electron cancels such requests outright.
    registerHttpAuthHandler();

    // Stop web pages from launching app protocols through session permission
    // requests (Electron grants all of them by default). Registered before any
    // window/webview so its session-created listener catches partition sessions.
    registerPermissionHandler();

    const appDataDir = join(app.getPath('appData'), dataDirName, 'freeter-data');
    const appDataStorage = await createFileDataStorage('string', appDataDir);
    const getTextFromAppDataStorageUseCase = createGetTextFromAppDataStorageUseCase({appDataStorage});
    const setTextInAppDataStorageUseCase = createSetTextInAppDataStorageUseCase({appDataStorage});

    const getWidgetDataStoragePath = (id: string) => join(appDataDir, 'widgets', id);
    const widgetDataStorageManager = createObjectManager(
      (id) => createFileDataStorage('string', getWidgetDataStoragePath(id)),
      (fromId, toId) => copyFileDataStorage(getWidgetDataStoragePath(fromId), getWidgetDataStoragePath(toId))
    );
    const getTextFromWidgetDataStorageUseCase = createGetTextFromWidgetDataStorageUseCase({widgetDataStorageManager});
    const setTextInWidgetDataStorageUseCase = createSetTextInWidgetDataStorageUseCase({widgetDataStorageManager});
    const deleteInWidgetDataStorageUseCase = createDeleteInWidgetDataStorageUseCase({widgetDataStorageManager});
    const clearWidgetDataStorageUseCase = createClearWidgetDataStorageUseCase({widgetDataStorageManager});
    const getKeysFromWidgetDataStorageUseCase = createGetKeysFromWidgetDataStorageUseCase({widgetDataStorageManager});
    const copyWidgetDataStorageUseCase = createCopyWidgetDataStorageUseCase({widgetDataStorageManager});

    // Shared storage lives under `shared/<widgetType>/<sharedKeyId>/` so
    // namespaces are isolated per widget type; ids are composed by
    // `sharedStorageId` and split back here.
    const getSharedDataStoragePath = (id: string) => {
      const {widgetType, sharedKeyId} = parseSharedStorageId(id);
      return join(appDataDir, 'shared', widgetType, sharedKeyId);
    };
    const sharedDataStorageManager = createObjectManager(
      (id) => createFileDataStorage('string', getSharedDataStoragePath(id)),
      (fromId, toId) => copyFileDataStorage(getSharedDataStoragePath(fromId), getSharedDataStoragePath(toId))
    );
    const getTextFromSharedDataStorageUseCase = createGetTextFromSharedDataStorageUseCase({sharedDataStorageManager});
    const setTextInSharedDataStorageUseCase = createSetTextInSharedDataStorageUseCase({sharedDataStorageManager});
    const deleteInSharedDataStorageUseCase = createDeleteInSharedDataStorageUseCase({sharedDataStorageManager});
    const clearSharedDataStorageUseCase = createClearSharedDataStorageUseCase({sharedDataStorageManager});
    const getKeysFromSharedDataStorageUseCase = createGetKeysFromSharedDataStorageUseCase({sharedDataStorageManager});

    // Local usage telemetry lives in its own dir, isolated from app/widget data,
    // so the user can wipe it independently (and inspect it as plain files).
    const telemetryDataStorage = await createFileDataStorage('string', join(appDataDir, 'telemetry'));
    const getTextFromTelemetryDataStorageUseCase = createGetTextFromTelemetryDataStorageUseCase({telemetryDataStorage});
    const setTextInTelemetryDataStorageUseCase = createSetTextInTelemetryDataStorageUseCase({telemetryDataStorage});
    const deleteInTelemetryDataStorageUseCase = createDeleteInTelemetryDataStorageUseCase({telemetryDataStorage});
    const clearTelemetryDataStorageUseCase = createClearTelemetryDataStorageUseCase({telemetryDataStorage});
    const getKeysFromTelemetryDataStorageUseCase = createGetKeysFromTelemetryDataStorageUseCase({telemetryDataStorage});

    // OS-wide activity monitor (foreground app/window + power/idle). Started only
    // when the renderer reports consent is on. Events are pushed to the renderer,
    // which records them through the same consent-gated telemetry pipeline.
    const osActivityMonitor = createOsActivityMonitor({
      reader: createForegroundWindowReader(),
      powerMonitor,
      now: () => Date.now(),
      emit: (event) => sendToAppWindow(ipcOsActivityEventChannel, event),
    });
    const setOsMonitoringUseCase = createSetOsMonitoringUseCase({osActivityMonitor});
    stopOsMonitor = () => osActivityMonitor.stop();

    const contextMenuProvider = createContextMenuProvider();
    const popupContextMenuUseCase = createPopupContextMenuUseCase({contextMenuProvider});

    const clipboardProvider = createClipboardProvider();
    const writeBookmarkIntoClipboardUseCase = createWriteBookmarkIntoClipboardUseCase({clipboardProvider});
    const writeTextIntoClipboardUseCase = createWriteTextIntoClipboardUseCase({clipboardProvider});

    const shellProvider = createShellProvider();
    const openExternalUrlUseCase = createOpenExternalUrlUseCase({shellProvider});
    const openPathUseCase = createOpenPathUseCase({shellProvider})
    const openAppDataDirUseCase = createOpenAppDataDirUseCase({shellProvider, appDataDir})

    // Serves the browser Analytics page (built next to main.js) and the raw
    // telemetry files it reads; started on first open, closed on quit.
    const analyticsServer = createAnalyticsServer({pageDir: join(__dirname, 'analytics'), storage: telemetryDataStorage});
    const openAnalyticsInBrowserUseCase = createOpenAnalyticsInBrowserUseCase({analyticsServer, shellProvider});
    stopAnalyticsServer = () => analyticsServer.stop();

    // AI control: external agents reach the app through a local pipe (spec
    // docs/superpowers/specs/2026-11-07-ai-infra-design.md). Requests run in the
    // renderer, which owns the app state; writes are confirmed here first.
    const aiActionBridge = createAiActionBridge({
      send: (reqId, req) => sendToAppWindow(ipcAiActionRequestChannel, reqId, req),
      timeoutMs: 150000,
    });
    const confirmAiActionUseCase = createConfirmAiActionUseCase({
      showWindow: () => {
        if (appWindow && !appWindow.isVisible()) {
          appWindow.show();
        }
        if (appWindow?.isMinimized()) {
          appWindow.restore();
        }
        // A visible window behind the agent's terminal would open the box out of sight.
        appWindow?.focus();
      },
      showConfirmBox: async (message, signal) => {
        const win = ElectronBrowserWindow.getAllWindows().find(w => w === appWindow);
        const opts: Electron.MessageBoxOptions = {
          message, buttons: ['Allow', 'Deny'], defaultId: 1, cancelId: 1, type: 'question', signal
        };
        const {response} = win ? await electronDialog.showMessageBox(win, opts) : await electronDialog.showMessageBox(opts);
        return response === 0;
      },
      timeoutMs: 120000,
    });
    const aiToken = randomBytes(32).toString('hex');
    const aiPipePath = getAiPipePath(appDataDir, process.platform);
    const aiControlServer = createAiControlServer({path: aiPipePath, token: aiToken, handle: aiActionBridge.request});
    aiControlServer.start()
      .then(() => writeAiEndpoint(appDataDir, {pipe: aiPipePath, token: aiToken, pid: process.pid}))
      .then(() => {
        stopAiControl = () => {
          aiControlServer.stop();
          removeAiEndpointSync(appDataDir);
        };
      })
      .catch(err => {
        // The app works without AI control; e.g. another process holds the pipe name.
        console.error('AI control server failed to start', err);
        aiControlServer.stop();
      });

    const aiDir = join(appDataDir, 'ai');
    /**
     * Windows: the PATH of the registry (system, then user) joins the app's own. Started by the installer (msiexec),
     * the app has no user PATH, so its terminals do not find programs such as claude (2026-11-09).
     * ponytail: reg output is in the OEM code page; a folder name with non-ASCII letters may not match (it is skipped).
     */
    if (process.platform === 'win32') {
      const read = (key: string) => {
        try {
          return parseRegPath(execFileSync('reg', ['query', key, '/v', 'Path'], {encoding: 'utf8', windowsHide: true, timeout: 5000}));
        } catch {
          return undefined;
        }
      };
      const fromRegistry = [read('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'), read('HKCU\\Environment')]
        .filter((v): v is string => v !== undefined)
        .map(v => expandEnvVars(v, process.env))
        .join(';');
      process.env.PATH = mergePath(process.env.PATH ?? '', fromRegistry);
    }
    // In-app terminals (pseudo-terminals). The shell gets the AI control endpoint and, in
    // an installed app, the `freeter` wrappers on PATH, so agents started in it can use them.
    const baseEnv: Record<string, string> = {
      ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
      FREETER_AI_ENDPOINT: join(aiDir, 'endpoint.json'),
      FREETER_AI_ORIGIN: 'terminal',
    };
    const ptyEnv = app.isPackaged ? prependPath(baseEnv, join(process.resourcesPath, 'bin'), pathDelimiter) : baseEnv;
    // Loaded lazily: if the native module cannot load (e.g. no build for this platform),
    // only terminals are unavailable; the app still starts.
    let nodePty: typeof NodePty | undefined;
    import('node-pty').then(m => {
      nodePty = m;
    }, err => console.error('Terminals unavailable: node-pty failed to load', err));
    // Found when first needed (a new tab, the shell menu), so app start does not wait for it; the PATH merge above
    // comes first, so PowerShell 7 on the user's PATH is found.
    let shellList: ShellOption[] | undefined;
    const shells = () => shellList ??= detectShells({
      platform: process.platform,
      env: process.env,
      exists: existsSync,
      readFile: p => {
        try {
          return readFileSync(p, 'utf8');
        } catch {
          return undefined;
        }
      },
      // Each installed distribution has a subkey here.
      hasWslDistro: () => {
        try {
          const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'], {encoding: 'utf8', windowsHide: true, timeout: 5000});
          return /\\Lxss\\\{/.test(out);
        } catch {
          return false;
        }
      },
    });
    const terminalHost = createTerminalHost({
      spawnPty: (shell, o) => {
        if (!nodePty) {
          throw new Error('Terminals are unavailable on this system');
        }
        return nodePty.spawn(shell, [], {name: 'xterm-256color', ...o});
      },
      defaultShell: () => (process.platform === 'win32' ? shells()[0].shell : (process.env.SHELL || '/bin/bash')),
      defaultCwd: homedir(),
      env: ptyEnv,
      emitData: (id, data, seq) => sendToAppWindow(ipcPtyDataChannel, id, data, seq),
      emitTitle: (id, title) => sendToAppWindow(ipcPtyTitleChannel, id, title),
      emitExit: (id, code) => sendToAppWindow(ipcPtyExitChannel, id, code),
      newId: () => randomUUID(),
      batchMs: 16,
      // A re-attached view gets this much history (the view itself keeps 5000 lines). ponytail: about 1.5 MB per
      // 120-column terminal (estimate); the parser runs on main for all output (measured about 6 us per TUI chunk).
      createMirror: (cols, rows) => createHeadlessMirror(cols, rows, 1000),
    });
    stopTerminals = () => terminalHost.killAll();

    const fsProvider = createFsProvider();
    const readDirUseCase = createReadDirUseCase({fsProvider});
    const searchFilesUseCase = createSearchFilesUseCase({fsProvider});
    const getHomeDirUseCase = createGetHomeDirUseCase({fsProvider});
    const getImageDataUrlUseCase = createGetImageDataUrlUseCase({fsProvider});

    const getProcessInfoUseCase = createGetProcessInfoUseCase({processProvider});
    const {isLinux} = await getProcessInfoUseCase();

    const systemStatsProvider = createSystemStatsProvider(() => app.getAppMetrics());
    const getSystemStatsUseCase = createGetSystemStatsUseCase({systemStatsProvider});

    // net.fetch (not Node fetch) so requests follow the system proxy, as company networks often require.
    const translateProvider = createTranslateProvider((url, init) => net.fetch(url, init));
    const translateTextsUseCase = createTranslateTextsUseCase({translateProvider});

    const dialogProvider = createDialogProvider();
    const dialogShowMessageBoxUseCase = createShowMessageBoxUseCase({dialogProvider});
    const showOpenFileDialogUseCase = createShowOpenFileDialogUseCase({dialogProvider});
    const showSaveFileDialogUseCase = createShowSaveFileDialogUseCase({dialogProvider});
    const showOpenDirDialogUseCase = createShowOpenDirDialogUseCase({dialogProvider});

    const appMenuProvider = createAppMenuProvider();
    const setAppMenuUseCase = createSetAppMenuUseCase({appMenuProvider});
    const setAppMenuAutoHideUseCase = createSetAppMenuAutoHideUseCase({appMenuProvider})

    const setMainShortcutUseCase = createSetMainShortcutUseCase({globalShortcutProvider});

    const trayProvider = createTrayProvider(join(app.getAppPath(), 'assets', 'app-icons', '16.png'));
    const setTrayMenuUseCase = createSetTrayMenuUseCase({trayProvider});
    const initTrayUseCase = createInitTrayUseCase({trayProvider, setTrayMenuUseCase});

    const showBrowserWindowUseCase = createShowBrowserWindowUseCase();

    const appsProvider = createAppsProvider();
    const childProcessProvider = createChildProcessProvider();
    const execCmdLinesInTerminalUseCase = createExecCmdLinesInTerminalUseCase({
      appsProvider,
      childProcessProvider,
      processProvider
    })

    const openAppUseCase = createOpenAppUseCase({childProcessProvider, processProvider})

    const iconProvider = createIconProvider();
    const getFileIconUseCase = createGetFileIconUseCase({iconProvider});
    const getFaviconUseCase = createGetFaviconUseCase({iconProvider});

    registerControllers(ipcMain, [
      ...createAppDataStorageControllers({getTextFromAppDataStorageUseCase, setTextInAppDataStorageUseCase}),
      ...createWidgetDataStorageControllers({
        getTextFromWidgetDataStorageUseCase,
        setTextInWidgetDataStorageUseCase,
        clearWidgetDataStorageUseCase,
        deleteInWidgetDataStorageUseCase,
        getKeysFromWidgetDataStorageUseCase,
        copyWidgetDataStorageUseCase,
      }),
      ...createContextMenuControllers({popupContextMenuUseCase}),
      ...createClipboardControllers({writeBookmarkIntoClipboardUseCase, writeTextIntoClipboardUseCase}),
      ...createShellControllers({openExternalUrlUseCase, openPathUseCase, openAppUseCase, openAppDataDirUseCase}),
      ...createFsControllers({readDirUseCase, getHomeDirUseCase, getImageDataUrlUseCase, searchFilesUseCase}),
      ...createProcessControllers({getProcessInfoUseCase}),
      ...createSystemStatsControllers({getSystemStatsUseCase}),
      ...createTranslateControllers({translateTextsUseCase}),
      ...createDialogControllers({
        showMessageBoxUseCase: dialogShowMessageBoxUseCase,
        showOpenDirDialogUseCase,
        showOpenFileDialogUseCase,
        showSaveFileDialogUseCase
      }),
      ...createAppMenuControllers({setAppMenuUseCase, setAppMenuAutoHideUseCase}),
      ...createGlobalShortcutControllers({setMainShortcutUseCase}),
      ...createTrayMenuControllers({setTrayMenuUseCase}),
      ...createBrowserWindowControllers({showBrowserWindowUseCase}),
      ...createTerminalControllers({execCmdLinesInTerminalUseCase}),
      ...createSharedDataStorageControllers({
        getTextFromSharedDataStorageUseCase,
        setTextInSharedDataStorageUseCase,
        deleteInSharedDataStorageUseCase,
        clearSharedDataStorageUseCase,
        getKeysFromSharedDataStorageUseCase,
        sendToAppWindow,
      }),
      ...createIconControllers({getFileIconUseCase, getFaviconUseCase}),
      ...createDownloadControllers({setDownloadDirUseCase}),
      ...createTelemetryDataStorageControllers({
        getTextFromTelemetryDataStorageUseCase,
        setTextInTelemetryDataStorageUseCase,
        deleteInTelemetryDataStorageUseCase,
        clearTelemetryDataStorageUseCase,
        getKeysFromTelemetryDataStorageUseCase,
      }),
      ...createOsActivityControllers({setOsMonitoringUseCase}),
      ...createAnalyticsControllers({openAnalyticsInBrowserUseCase}),
      ...createAiControllers({aiActionBridge, confirmAiActionUseCase}),
      ...createPtyControllers({terminalHost, shells})
    ])
    const ptyInput = createPtyInputListener({terminalHost});
    ipcMain.on(ptyInput.channel, ptyInput.listener);

    const [windowStore] = createWindowStore({
      stateStorage: createWindowStateStorage(
        setTextOnlyIfChanged(withJson(appDataStorage))
      )
    }, {
      h: 0,
      w: 0,
      x: 0,
      y: 0,
      isFull: false,
      isMaxi: false,
      isMini: false
    }, () => {
      const getWindowStateUseCase = createGetWindowStateUseCase({windowStore})
      const setWindowStateUseCase = createSetWindowStateUseCase({windowStore})
      appWindow = createRendererWindow(
        `${__dirname}/preload.js`,
        `${schemeFreeterFile}://${hostFreeterApp}/index.html`,
        isLinux ? join(app.getAppPath(), 'assets', 'app-icons', '256.png') : undefined,
        uaOriginal,
        {
          getWindowStateUseCase,
          setWindowStateUseCase
        },
        {
          devTools: isDevMode,
        }
      )
      const appWebContents = ElectronBrowserWindow.getAllWindows().find(w => w === appWindow)?.webContents;
      if (appWebContents) {
        closeAiWhenAppPageGoes(appWebContents, aiActionBridge);
        // A new page (reload) has no view for the old shells, and starts its own.
        appWebContents.on('did-navigate', () => {
          stopTerminals?.();
        });
      }

      app.on('browser-window-created', (_e, win) => {
        // Disable menu in child windows
        if (win !== appWindow) {
          win.removeMenu();
        }
      });

      initTrayUseCase(appWindow);
    })
    flushWindowStore = () => windowStore.flush();
  });

}
