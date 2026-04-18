/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { join } from 'node:path';
import { hostFreeterApp, schemeFreeterFile } from '@common/infra/network';
import { channelPrefix } from '@common/ipc/ipc';
import { createIpcMain } from '@/infra/ipcMain/ipcMain';
import { app } from 'electron';
import { createRendererWindow } from '@/infra/browserWindow/browserWindow';
import { createIpcMainEventValidator } from '@/infra/ipcMain/ipcMainEventValidator';
import { registerAppFileProtocol } from '@/infra/protocolHandler/registerAppFileProtocol';
import { registerControllers } from '@/controllers/controller';
import { createAppDataStorageControllers } from '@/controllers/appDataStorage';
import { createGetTextFromAppDataStorageUseCase } from '@/application/useCases/appDataStorage/getTextFromAppDataStorage';
import { createSetTextInAppDataStorageUseCase } from '@/application/useCases/appDataStorage/setTextInAppDataStorage';
import { copyFileDataStorage, createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';
import { createContextMenuControllers } from '@/controllers/contextMenu';
import { createPopupContextMenuUseCase } from '@/application/useCases/contextMenu/popupContextMenu';
import { createContextMenuProvider } from '@/infra/contextMenuProvider/contextMenuProvider';
import { createClipboardControllers } from '@/controllers/clipboard';
import { createShellControllers } from '@/controllers/shell';
import { createWriteTextIntoClipboardUseCase } from '@/application/useCases/clipboard/writeTextIntoClipboard';
import { createClipboardProvider } from '@/infra/clipboardProvider/clipboardProvider';
import { createOpenExternalUrlUseCase } from '@/application/useCases/shell/openExternalUrl';
import { createShellProvider } from '@/infra/shellProvider/shellProvider';
import { createProcessControllers } from '@/controllers/process';
import { createGetProcessInfoUseCase } from '@/application/useCases/process/getProcessInfo';
import { createProcessProvider } from '@/infra/processProvider/processProvider';
import { createWriteBookmarkIntoClipboardUseCase } from '@/application/useCases/clipboard/writeBookmarkIntoClipboard';
import { createObjectManager } from '@common/base/objectManager';
import { createGetTextFromWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/getTextFromWidgetDataStorage';
import { createSetTextInWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/setTextInWidgetDataStorage';
import { createWidgetDataStorageControllers } from '@/controllers/widgetDataStorage';
import { createDeleteInWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/deleteInWidgetDataStorage';
import { createClearWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/clearWidgetDataStorage';
import { createGetKeysFromWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/getKeysFromWidgetDataStorage';
import { createDialogControllers } from '@/controllers/dialog';
import { createShowMessageBoxUseCase } from '@/application/useCases/dialog/showMessageBox';
import { createDialogProvider } from '@/infra/dialogProvider/dialogProvider';
import { createAppMenuControllers } from '@/controllers/appMenu';
import { createAppMenuProvider } from '@/infra/appMenuProvider/appMenuProvider';
import { createSetAppMenuUseCase } from '@/application/useCases/appMenu/setAppMenu';
import { createSetAppMenuAutoHideUseCase } from '@/application/useCases/appMenu/setAppMenuAutoHide';
import { createWindowStore } from '@/data/windowStore';
import { createWindowStateStorage } from '@/data/windowStateStorage';
import { setTextOnlyIfChanged } from '@common/infra/dataStorage/setTextOnlyIfChanged';
import { withJson } from '@common/infra/dataStorage/withJson';
import { createGetWindowStateUseCase } from '@/application/useCases/browserWindow/getWindowState';
import { createSetWindowStateUseCase } from '@/application/useCases/browserWindow/setWindowState';
import { BrowserWindow } from '@/application/interfaces/browserWindow';
import { createGlobalShortcutControllers } from '@/controllers/globalShortcut';
import { createSetMainShortcutUseCase } from '@/application/useCases/globalShortcut/setMainShortcut';
import { createGlobalShortcutProvider } from '@/infra/globalShortcut/globalShortcutProvider';
import { createTrayProvider } from '@/infra/trayProvider/trayProvider';
import { createInitTrayUseCase } from '@/application/useCases/tray/initTray';
import { createSetTrayMenuUseCase } from '@/application/useCases/tray/setTrayMenu';
import { createTrayMenuControllers } from '@/controllers/trayMenu';
import { createBrowserWindowControllers } from '@/controllers/browserWindow';
import { createShowBrowserWindowUseCase } from '@/application/useCases/browserWindow/showBrowserWindow';
import { createShowOpenFileDialogUseCase } from '@/application/useCases/dialog/showOpenFileDialog';
import { createShowSaveFileDialogUseCase } from '@/application/useCases/dialog/showSaveFileDialog';
import { createShowOpenDirDialogUseCase } from '@/application/useCases/dialog/showOpenDirDialog';
import { createTerminalControllers } from '@/controllers/terminal';
import { createExecCmdLinesInTerminalUseCase } from '@/application/useCases/terminal/execCmdLinesInTerminal';
import { createAppsProvider } from '@/infra/appsProvider/appsProvider';
import { createChildProcessProvider } from '@/infra/childProcessProvider/childProcessProvider';
import { createOpenPathUseCase } from '@/application/useCases/shell/openPath';
import { createCopyWidgetDataStorageUseCase } from '@/application/useCases/widgetDataStorage/copyWidgetDataStorage';
import { createOpenAppUseCase } from '@/application/useCases/shell/openApp';
import { createOpenAppDataDirUseCase } from '@/application/useCases/shell/openAppDataDir';
import { parseSharedStorageId } from '@common/base/sharedStorageId';
import { createGetTextFromSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/getTextFromSharedDataStorage';
import { createSetTextInSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/setTextInSharedDataStorage';
import { createDeleteInSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/deleteInSharedDataStorage';
import { createClearSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/clearSharedDataStorage';
import { createGetKeysFromSharedDataStorageUseCase } from '@/application/useCases/sharedDataStorage/getKeysFromSharedDataStorage';
import { createSharedDataStorageControllers } from '@/controllers/sharedDataStorage';
import { createIconProvider } from '@/infra/iconProvider/iconProvider';
import { createGetFileIconUseCase } from '@/application/useCases/icon/getFileIcon';
import { createGetFaviconUseCase } from '@/application/useCases/icon/getFavicon';
import { createIconControllers } from '@/controllers/icon';

let appWindow: BrowserWindow | null = null; // ref to the app window

if (!app.requestSingleInstanceLock()) {
  // there is another instance of the app running
  app.quit();
} {
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

  const processProvider = createProcessProvider();
  const processInfo = processProvider.getProcessInfo();
  const { isDevMode } = processInfo;

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
    // Unregister global shortcuts
    globalShortcutProvider.destroy();
  })

  app.whenReady().then(async () => {
    const ipcMainEventValidator = createIpcMainEventValidator(channelPrefix, hostFreeterApp);
    const ipcMain = createIpcMain(ipcMainEventValidator);

    const appDataDir = join(app.getPath('appData'), 'freeter-swh', 'freeter-data');
    const appDataStorage = await createFileDataStorage('string', appDataDir);
    const getTextFromAppDataStorageUseCase = createGetTextFromAppDataStorageUseCase({ appDataStorage });
    const setTextInAppDataStorageUseCase = createSetTextInAppDataStorageUseCase({ appDataStorage });

    const getWidgetDataStoragePath = (id: string) => join(appDataDir, 'widgets', id);
    const widgetDataStorageManager = createObjectManager(
      (id) => createFileDataStorage('string', getWidgetDataStoragePath(id)),
      (fromId, toId) => copyFileDataStorage(getWidgetDataStoragePath(fromId), getWidgetDataStoragePath(toId))
    );
    const getTextFromWidgetDataStorageUseCase = createGetTextFromWidgetDataStorageUseCase({ widgetDataStorageManager });
    const setTextInWidgetDataStorageUseCase = createSetTextInWidgetDataStorageUseCase({ widgetDataStorageManager });
    const deleteInWidgetDataStorageUseCase = createDeleteInWidgetDataStorageUseCase({ widgetDataStorageManager });
    const clearWidgetDataStorageUseCase = createClearWidgetDataStorageUseCase({ widgetDataStorageManager });
    const getKeysFromWidgetDataStorageUseCase = createGetKeysFromWidgetDataStorageUseCase({ widgetDataStorageManager });
    const copyWidgetDataStorageUseCase = createCopyWidgetDataStorageUseCase({ widgetDataStorageManager });

    // Shared storage lives under `shared/<widgetType>/<sharedKeyId>/` so
    // namespaces are isolated per widget type; ids are composed by
    // `sharedStorageId` and split back here.
    const getSharedDataStoragePath = (id: string) => {
      const { widgetType, sharedKeyId } = parseSharedStorageId(id);
      return join(appDataDir, 'shared', widgetType, sharedKeyId);
    };
    const sharedDataStorageManager = createObjectManager(
      (id) => createFileDataStorage('string', getSharedDataStoragePath(id)),
      (fromId, toId) => copyFileDataStorage(getSharedDataStoragePath(fromId), getSharedDataStoragePath(toId))
    );
    const getTextFromSharedDataStorageUseCase = createGetTextFromSharedDataStorageUseCase({ sharedDataStorageManager });
    const setTextInSharedDataStorageUseCase = createSetTextInSharedDataStorageUseCase({ sharedDataStorageManager });
    const deleteInSharedDataStorageUseCase = createDeleteInSharedDataStorageUseCase({ sharedDataStorageManager });
    const clearSharedDataStorageUseCase = createClearSharedDataStorageUseCase({ sharedDataStorageManager });
    const getKeysFromSharedDataStorageUseCase = createGetKeysFromSharedDataStorageUseCase({ sharedDataStorageManager });

    const contextMenuProvider = createContextMenuProvider();
    const popupContextMenuUseCase = createPopupContextMenuUseCase({ contextMenuProvider });

    const clipboardProvider = createClipboardProvider();
    const writeBookmarkIntoClipboardUseCase = createWriteBookmarkIntoClipboardUseCase({ clipboardProvider });
    const writeTextIntoClipboardUseCase = createWriteTextIntoClipboardUseCase({ clipboardProvider });

    const shellProvider = createShellProvider();
    const openExternalUrlUseCase = createOpenExternalUrlUseCase({ shellProvider });
    const openPathUseCase = createOpenPathUseCase({ shellProvider })
    const openAppDataDirUseCase = createOpenAppDataDirUseCase({ shellProvider, appDataDir })

    const getProcessInfoUseCase = createGetProcessInfoUseCase({ processProvider });
    const { isLinux } = await getProcessInfoUseCase();

    const dialogProvider = createDialogProvider();
    const dialogShowMessageBoxUseCase = createShowMessageBoxUseCase({ dialogProvider });
    const showOpenFileDialogUseCase = createShowOpenFileDialogUseCase({ dialogProvider });
    const showSaveFileDialogUseCase = createShowSaveFileDialogUseCase({ dialogProvider });
    const showOpenDirDialogUseCase = createShowOpenDirDialogUseCase({ dialogProvider });

    const appMenuProvider = createAppMenuProvider();
    const setAppMenuUseCase = createSetAppMenuUseCase({ appMenuProvider });
    const setAppMenuAutoHideUseCase = createSetAppMenuAutoHideUseCase({ appMenuProvider })

    const setMainShortcutUseCase = createSetMainShortcutUseCase({ globalShortcutProvider });

    const trayProvider = createTrayProvider(join(app.getAppPath(), 'assets', 'app-icons', '16.png'));
    const setTrayMenuUseCase = createSetTrayMenuUseCase({ trayProvider });
    const initTrayUseCase = createInitTrayUseCase({ trayProvider, setTrayMenuUseCase });

    const showBrowserWindowUseCase = createShowBrowserWindowUseCase();

    const appsProvider = createAppsProvider();
    const childProcessProvider = createChildProcessProvider();
    const execCmdLinesInTerminalUseCase = createExecCmdLinesInTerminalUseCase({ appsProvider, childProcessProvider, processProvider })

    const openAppUseCase = createOpenAppUseCase({ childProcessProvider, processProvider })

    const iconProvider = createIconProvider();
    const getFileIconUseCase = createGetFileIconUseCase({ iconProvider });
    const getFaviconUseCase = createGetFaviconUseCase({ iconProvider });

    registerControllers(ipcMain, [
      ...createAppDataStorageControllers({ getTextFromAppDataStorageUseCase, setTextInAppDataStorageUseCase }),
      ...createWidgetDataStorageControllers({
        getTextFromWidgetDataStorageUseCase,
        setTextInWidgetDataStorageUseCase,
        clearWidgetDataStorageUseCase,
        deleteInWidgetDataStorageUseCase,
        getKeysFromWidgetDataStorageUseCase,
        copyWidgetDataStorageUseCase,
      }),
      ...createContextMenuControllers({ popupContextMenuUseCase }),
      ...createClipboardControllers({ writeBookmarkIntoClipboardUseCase, writeTextIntoClipboardUseCase }),
      ...createShellControllers({ openExternalUrlUseCase, openPathUseCase, openAppUseCase, openAppDataDirUseCase }),
      ...createProcessControllers({ getProcessInfoUseCase }),
      ...createDialogControllers({
        showMessageBoxUseCase: dialogShowMessageBoxUseCase,
        showOpenDirDialogUseCase,
        showOpenFileDialogUseCase,
        showSaveFileDialogUseCase
      }),
      ...createAppMenuControllers({ setAppMenuUseCase, setAppMenuAutoHideUseCase }),
      ...createGlobalShortcutControllers({ setMainShortcutUseCase }),
      ...createTrayMenuControllers({ setTrayMenuUseCase }),
      ...createBrowserWindowControllers({ showBrowserWindowUseCase }),
      ...createTerminalControllers({ execCmdLinesInTerminalUseCase }),
      ...createSharedDataStorageControllers({
        getTextFromSharedDataStorageUseCase,
        setTextInSharedDataStorageUseCase,
        deleteInSharedDataStorageUseCase,
        clearSharedDataStorageUseCase,
        getKeysFromSharedDataStorageUseCase,
      }),
      ...createIconControllers({ getFileIconUseCase, getFaviconUseCase })
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
      const getWindowStateUseCase = createGetWindowStateUseCase({ windowStore })
      const setWindowStateUseCase = createSetWindowStateUseCase({ windowStore })
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
  });

}
