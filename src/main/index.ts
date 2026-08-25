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
import {createWriteTextFileUseCase} from '@/application/useCases/fs/writeTextFile';
import {createSetMainShortcutUseCase} from '@/application/useCases/globalShortcut/setMainShortcut';
import {createGetFaviconUseCase} from '@/application/useCases/icon/getFavicon';
import {createGetFileIconUseCase} from '@/application/useCases/icon/getFileIcon';
import {createSetOsMonitoringUseCase} from '@/application/useCases/osActivity/setOsMonitoring';
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
import {createProcessControllers} from '@/controllers/process';
import {createSharedDataStorageControllers} from '@/controllers/sharedDataStorage';
import {createShellControllers} from '@/controllers/shell';
import {createSystemStatsControllers} from '@/controllers/systemStats';
import {createTelemetryDataStorageControllers} from '@/controllers/telemetryDataStorage';
import {createTerminalControllers} from '@/controllers/terminal';
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
import {createForegroundWindowReader} from '@/infra/osActivity/foregroundWindow';
import {createProcessProvider} from '@/infra/processProvider/processProvider';
import {registerAppFileProtocol} from '@/infra/protocolHandler/registerAppFileProtocol';
import {createShellProvider} from '@/infra/shellProvider/shellProvider';
import {createSystemStatsProvider} from '@/infra/systemStatsProvider/systemStatsProvider';
import {createTrayProvider} from '@/infra/trayProvider/trayProvider';
import {createObjectManager} from '@common/base/objectManager';
import {parseSharedStorageId} from '@common/base/sharedStorageId';
import {setTextOnlyIfChanged} from '@common/infra/dataStorage/setTextOnlyIfChanged';
import {withJson} from '@common/infra/dataStorage/withJson';
import {hostFreeterApp, schemeFreeterFile} from '@common/infra/network';
import {ipcOsActivityEventChannel} from '@common/ipc/channels';
import {channelPrefix} from '@common/ipc/ipc';
import {app, BrowserWindow as ElectronBrowserWindow, powerMonitor} from 'electron';
import {join} from 'node:path';

let appWindow: BrowserWindow | null = null; // ref to the app window

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
  // there is another instance of the app running
  app.quit();
}
{
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
    // Unregister global shortcuts
    globalShortcutProvider.destroy();
  })

  app.whenReady().then(async () => {
    const ipcMainEventValidator = createIpcMainEventValidator(channelPrefix, hostFreeterApp);
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
      emit: (event) => {
        for (const win of ElectronBrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            // A window can be torn down between the guard and send; isolate each
            // so one dead window can't abort delivery to the others.
            try {
              win.webContents.send(ipcOsActivityEventChannel, event);
            } catch { /* window gone */
            }
          }
        }
      },
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

    const fsProvider = createFsProvider();
    const readDirUseCase = createReadDirUseCase({fsProvider});
    const getHomeDirUseCase = createGetHomeDirUseCase({fsProvider});
    const getImageDataUrlUseCase = createGetImageDataUrlUseCase({fsProvider});
    const writeTextFileUseCase = createWriteTextFileUseCase({fsProvider});

    const getProcessInfoUseCase = createGetProcessInfoUseCase({processProvider});
    const {isLinux} = await getProcessInfoUseCase();

    const systemStatsProvider = createSystemStatsProvider();
    const getSystemStatsUseCase = createGetSystemStatsUseCase({systemStatsProvider});

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
      ...createFsControllers({readDirUseCase, getHomeDirUseCase, getImageDataUrlUseCase, writeTextFileUseCase}),
      ...createProcessControllers({getProcessInfoUseCase}),
      ...createSystemStatsControllers({getSystemStatsUseCase}),
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
      ...createOsActivityControllers({setOsMonitoringUseCase})
    ])

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
