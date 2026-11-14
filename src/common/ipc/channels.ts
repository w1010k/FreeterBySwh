/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiOrigin, AiRpcRequest, AiRpcResult } from '@common/ai/protocol';
import { MenuItemsIpc } from '@common/base/menu';
import { ProcessInfo } from '@common/base/process';
import { FsDirEntry, FsSearchOptions, FsSearchResult, ReadDirOptions } from '@common/base/fs';
import { SystemStats } from '@common/base/systemStats';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';
import { makeIpcChannelName } from '@common/ipc/ipc';
import { MessageBoxConfig, MessageBoxResult, OpenDialogResult, OpenDirDialogConfig, OpenFileDialogConfig, SaveDialogResult, SaveFileDialogConfig } from '@common/base/dialog';

export const ipcAppDataStorageGetTextChannel = makeIpcChannelName('app-data-storage-get-text');
export type IpcAppDataStorageGetTextArgs = [key: string];
export type IpcAppDataStorageGetTextRes = string | undefined;

export const ipcAppDataStorageSetTextChannel = makeIpcChannelName('app-data-storage-set-text');
export type IpcAppDataStorageSetTextArgs = [key: string, text: string];
export type IpcAppDataStorageSetTextRes = void;

export const ipcAppDataStorageDeleteChannel = makeIpcChannelName('app-data-storage-delete');
export type IpcAppDataStorageDeleteArgs = [key: string];
export type IpcAppDataStorageDeleteRes = void;

export const ipcAppDataStorageClearChannel = makeIpcChannelName('app-data-storage-clear');
export type IpcAppDataStorageClearArgs = [];
export type IpcAppDataStorageClearRes = void;

export const ipcAppDataStorageGetKeysChannel = makeIpcChannelName('app-data-storage-get-keys');
export type IpcAppDataStorageGetKeysArgs = [];
export type IpcAppDataStorageGetKeysRes = string[];

export const ipcWidgetDataStorageGetTextChannel = makeIpcChannelName('widget-data-storage-get-text');
export type IpcWidgetDataStorageGetTextArgs = [widgetId: string, key: string];
export type IpcWidgetDataStorageGetTextRes = string | undefined;

export const ipcWidgetDataStorageSetTextChannel = makeIpcChannelName('widget-data-storage-set-text');
export type IpcWidgetDataStorageSetTextArgs = [widgetId: string, key: string, text: string];
export type IpcWidgetDataStorageSetTextRes = void;

export const ipcWidgetDataStorageDeleteChannel = makeIpcChannelName('widget-data-storage-delete');
export type IpcWidgetDataStorageDeleteArgs = [widgetId: string, key: string];
export type IpcWidgetDataStorageDeleteRes = void;

export const ipcWidgetDataStorageClearChannel = makeIpcChannelName('widget-data-storage-clear');
export type IpcWidgetDataStorageClearArgs = [widgetId: string];
export type IpcWidgetDataStorageClearRes = void;

export const ipcWidgetDataStorageGetKeysChannel = makeIpcChannelName('widget-data-storage-get-keys');
export type IpcWidgetDataStorageGetKeysArgs = [widgetId: string];
export type IpcWidgetDataStorageGetKeysRes = string[];

export const ipcCopyWidgetDataStorageChannel = makeIpcChannelName('copt-widget-data-storage');
export type IpcCopyWidgetDataStorageArgs = [srcWidgetId: string, toWidgetId: string];
export type IpcCopyWidgetDataStorageRes = boolean;

export const ipcTelemetryDataStorageGetTextChannel = makeIpcChannelName('telemetry-data-storage-get-text');
export type IpcTelemetryDataStorageGetTextArgs = [key: string];
export type IpcTelemetryDataStorageGetTextRes = string | undefined;

export const ipcTelemetryDataStorageSetTextChannel = makeIpcChannelName('telemetry-data-storage-set-text');
export type IpcTelemetryDataStorageSetTextArgs = [key: string, text: string];
export type IpcTelemetryDataStorageSetTextRes = void;

export const ipcTelemetryDataStorageDeleteChannel = makeIpcChannelName('telemetry-data-storage-delete');
export type IpcTelemetryDataStorageDeleteArgs = [key: string];
export type IpcTelemetryDataStorageDeleteRes = void;

export const ipcTelemetryDataStorageClearChannel = makeIpcChannelName('telemetry-data-storage-clear');
export type IpcTelemetryDataStorageClearArgs = [];
export type IpcTelemetryDataStorageClearRes = void;

export const ipcTelemetryDataStorageGetKeysChannel = makeIpcChannelName('telemetry-data-storage-get-keys');
export type IpcTelemetryDataStorageGetKeysArgs = [];
export type IpcTelemetryDataStorageGetKeysRes = string[];

export const ipcSharedDataGetTextChannel = makeIpcChannelName('shared-data-get-text');
export type IpcSharedDataGetTextArgs = [widgetType: string, sharedKeyId: string, key: string];
export type IpcSharedDataGetTextRes = string | undefined;

export const ipcSharedDataSetTextChannel = makeIpcChannelName('shared-data-set-text');
export type IpcSharedDataSetTextArgs = [widgetType: string, sharedKeyId: string, key: string, text: string];
export type IpcSharedDataSetTextRes = void;

export const ipcSharedDataDeleteChannel = makeIpcChannelName('shared-data-delete');
export type IpcSharedDataDeleteArgs = [widgetType: string, sharedKeyId: string, key: string];
export type IpcSharedDataDeleteRes = void;

export const ipcSharedDataClearChannel = makeIpcChannelName('shared-data-clear');
export type IpcSharedDataClearArgs = [widgetType: string, sharedKeyId: string];
export type IpcSharedDataClearRes = void;

export const ipcSharedDataGetKeysChannel = makeIpcChannelName('shared-data-get-keys');
export type IpcSharedDataGetKeysArgs = [widgetType: string, sharedKeyId: string];
export type IpcSharedDataGetKeysRes = string[];

/** main → renderer notification fired after any successful write to a shared
 *  data bucket, so widgets subscribing to the same key can reload. */
export const ipcSharedDataChangedChannel = makeIpcChannelName('shared-data-changed');
export type IpcSharedDataChangedArgs = [widgetType: string, sharedKeyId: string];

export const ipcPopupOsContextMenuChannel = makeIpcChannelName('popup-os-context-menu');
export type IpcPopupOsContextMenuArgs = [menuItems: MenuItemsIpc];
export type IpcPopupOsContextMenuRes = number | undefined;

export const ipcShellOpenAppChannel = makeIpcChannelName('shell-open-app');
export type IpcShellOpenAppArgs = [appPath: string, args?: string[]];
export type IpcShellOpenAppRes = void;

export const ipcShellOpenExternalUrlChannel = makeIpcChannelName('shell-open-external-url');
export type IpcShellOpenExternalUrlArgs = [url: string];
export type IpcShellOpenExternalUrlRes = void;

export const ipcShellOpenPathChannel = makeIpcChannelName('shell-open-path');
export type IpcShellOpenPathArgs = [path: string];
export type IpcShellOpenPathRes = string;

export const ipcBackUpAppDataChannel = makeIpcChannelName('back-up-app-data');
export type IpcBackUpAppDataArgs = [];
export type IpcBackUpAppDataRes = void;

export const ipcRestoreAppDataChannel = makeIpcChannelName('restore-app-data');
export type IpcRestoreAppDataArgs = [];
export type IpcRestoreAppDataRes = void;

export const ipcShellOpenAppDataDirChannel = makeIpcChannelName('shell-open-app-data-dir');
export type IpcShellOpenAppDataDirArgs = [];
export type IpcShellOpenAppDataDirRes = string;

export const ipcSwitchWorkflowByOffsetChannel = makeIpcChannelName('switch-workflow-by-offset');
export type IpcSwitchWorkflowByOffsetArgs = [offset: number];
export type IpcSwitchWorkflowByOffsetRes = void;

export type IpcZoomWebpageDirection = 'in' | 'out' | 'reset';
/** main → app page: a guest's new-window request was not opened. Args: guest webContentsId, url, reason. */
export const ipcWebpageWindowBlockedChannel = makeIpcChannelName('webpage-window-blocked');
export type IpcWebpageWindowBlockedReason = 'popupLimit' | 'scheme';
/** In-app popups open at once under one Webpage widget webview (main enforces it; the notice names it). */
export const maxPopupsPerGuest = 5;

export const ipcZoomWebpageChannel = makeIpcChannelName('zoom-webpage');
export type IpcZoomWebpageArgs = [webContentsId: number, direction: IpcZoomWebpageDirection];
export type IpcZoomWebpageRes = void;

export const ipcGoHomeWebpageChannel = makeIpcChannelName('go-home-webpage');
export type IpcGoHomeWebpageArgs = [webContentsId: number];
export type IpcGoHomeWebpageRes = void;

export const ipcWriteBookmarkIntoClipboardChannel = makeIpcChannelName('write-bookmark-into-clipboard');
export type IpcWriteBookmarkIntoClipboardArgs = [title: string, url: string];
export type IpcWriteBookmarkIntoClipboardRes = void;

export const ipcWriteTextIntoClipboardChannel = makeIpcChannelName('write-text-into-clipboard');
export type IpcWriteTextIntoClipboardArgs = [text: string];
export type IpcWriteTextIntoClipboardRes = void;

export const ipcCopyImageAtIntoClipboardChannel = makeIpcChannelName('copy-image-at-into-clipboard');
export type IpcCopyImageAtIntoClipboardArgs = [webContentsId: number, x: number, y: number];
export type IpcCopyImageAtIntoClipboardRes = void;

export const ipcGetProcessInfoChannel = makeIpcChannelName('get-process-info');
export type IpcGetProcessInfoArgs = [];
export type IpcGetProcessInfoRes = ProcessInfo;

export const ipcShowOsMessageBoxChannel = makeIpcChannelName('show-os-message-box');
export type IpcShowOsMessageBoxArgs = [config: MessageBoxConfig];
export type IpcShowOsMessageBoxRes = MessageBoxResult;

export const ipcShowOsOpenFileDialogChannel = makeIpcChannelName('show-os-open-file-dialog');
export type IpcShowOsOpenFileDialogArgs = [config: OpenFileDialogConfig];
export type IpcShowOsOpenFileDialogRes = OpenDialogResult;

export const ipcShowOsSaveFileDialogChannel = makeIpcChannelName('show-os-save-file-dialog');
export type IpcShowOsSaveFileDialogArgs = [config: SaveFileDialogConfig];
export type IpcShowOsSaveFileDialogRes = SaveDialogResult;

export const ipcShowOsOpenDirDialogChannel = makeIpcChannelName('show-os-open-dir-dialog');
export type IpcShowOsOpenDirDialogArgs = [config: OpenDirDialogConfig];
export type IpcShowOsOpenDirDialogRes = OpenDialogResult;

export const ipcSetAppMenuChannel = makeIpcChannelName('set-app-menu');
export type IpcSetAppMenuArgs = [menuItems: MenuItemsIpc];
export type IpcSetAppMenuRes = void;


export const ipcSetAppMenuAutoHideChannel = makeIpcChannelName('set-app-menu-auto-hide');
export type IpcSetAppMenuAutoHideArgs = [autoHide: boolean];
export type IpcSetAppMenuAutoHideRes = void;

/** The app's own menu bar (Windows, Linux): opens a top-level menu of the app menu at x, y. Resolves when it closes. */
export const ipcPopupAppMenuChannel = makeIpcChannelName('popup-app-menu');
export type IpcPopupAppMenuArgs = [index: number, x: number, y: number];
export type IpcPopupAppMenuRes = void;

/** The colors of the window buttons (minimize, maximize, close) that the OS draws over the app's title bar. */
export const ipcSetTitleBarColorsChannel = makeIpcChannelName('set-title-bar-colors');
export type IpcSetTitleBarColorsArgs = [color: string, symbolColor: string];
export type IpcSetTitleBarColorsRes = void;

export const ipcClickAppMenuActionChannel = makeIpcChannelName('click-app-menu-action');
export type IpcClickAppMenuActionArgs = [actionId: number];

export const ipcSetMainShortcutChannel = makeIpcChannelName('set-main-shortcut');
export type IpcSetMainShortcutArgs = [accelerator: string];
export type IpcSetMainShortcutRes = boolean;

export const ipcSetDownloadDirChannel = makeIpcChannelName('set-download-dir');
export type IpcSetDownloadDirArgs = [dir: string];
export type IpcSetDownloadDirRes = void;

export const ipcSetTrayMenuChannel = makeIpcChannelName('set-tray-menu');
export type IpcSetTrayMenuArgs = [menuItems: MenuItemsIpc];
export type IpcSetTrayMenuRes = void;

export const ipcClickTrayMenuActionChannel = makeIpcChannelName('click-tray-menu-action');
export type IpcClickTrayMenuActionArgs = [actionId: number];

export const ipcShowBrowserWindowChannel = makeIpcChannelName('show-browser-window');
export type IpcShowBrowserWindowArgs = [];
export type IpcShowBrowserWindowRes = void;

/** main → renderer: the app window gained (true) or lost (false) focus. */
export const ipcAppFocusChangedChannel = makeIpcChannelName('app-focus-changed');
export type IpcAppFocusChangedArgs = [focused: boolean];

/** renderer → main: start/stop OS-wide activity monitoring (gated on consent). */
export const ipcSetOsMonitoringChannel = makeIpcChannelName('set-os-monitoring');
export type IpcSetOsMonitoringArgs = [enabled: boolean];
export type IpcSetOsMonitoringRes = void;

/** main → renderer: an OS-wide activity event (foreground app/window or power event). */
export const ipcOsActivityEventChannel = makeIpcChannelName('os-activity-event');
export type IpcOsActivityEventArgs = [event: { type: 'os_window' | 'system_event'; text: string; detail?: string; durationMs?: number }];

/**
 * renderer → main: open the Analytics page in the default browser. Main starts
 * (or reuses) its local analytics server and serves the given id→name snapshot
 * alongside the raw telemetry files.
 */
export const ipcOpenAnalyticsChannel = makeIpcChannelName('open-analytics');
export type IpcOpenAnalyticsArgs = [entities: TelemetryEntitiesSnapshot];
export type IpcOpenAnalyticsRes = void;


export const ipcExecCmdLinesInTerminalChannel = makeIpcChannelName('exec-cmd-lines-in-terminal');
export type IpcExecCmdLinesInTerminalArgs = [cmdLines: ReadonlyArray<string>, cwd?: string];
export type IpcExecCmdLinesInTerminalRes = void;

export const ipcGetFileIconChannel = makeIpcChannelName('get-file-icon');
export type IpcGetFileIconArgs = [path: string, bypassCache?: boolean];
export type IpcGetFileIconRes = string | null;

export const ipcGetFaviconChannel = makeIpcChannelName('get-favicon');
export type IpcGetFaviconArgs = [url: string, bypassCache?: boolean];
export type IpcGetFaviconRes = string | null;

export const ipcFsReadDirChannel = makeIpcChannelName('fs-read-dir');
export type IpcFsReadDirArgs = [dirPath: string, opts?: ReadDirOptions];
export type IpcFsReadDirRes = FsDirEntry[];

export const ipcFsSearchChannel = makeIpcChannelName('fs-search');
export type IpcFsSearchArgs = [roots: string[], query: string, opts?: FsSearchOptions];
export type IpcFsSearchRes = FsSearchResult;

export const ipcFsGetHomeDirChannel = makeIpcChannelName('fs-get-home-dir');
export type IpcFsGetHomeDirArgs = [];
export type IpcFsGetHomeDirRes = string;

export const ipcFsGetImageDataUrlChannel = makeIpcChannelName('fs-get-image-data-url');
export type IpcFsGetImageDataUrlArgs = [path: string];
export type IpcFsGetImageDataUrlRes = string | null;

export const ipcGetSystemStatsChannel = makeIpcChannelName('get-system-stats');
export type IpcGetSystemStatsArgs = [];
export type IpcGetSystemStatsRes = SystemStats;

/** Machine-translate page text for the Webpage widget's Translate Page. Same order and length as `texts`. */
export const ipcTranslateTextsChannel = makeIpcChannelName('translate-texts');
export type IpcTranslateTextsArgs = [texts: string[]];
export type IpcTranslateTextsRes = string[];

/** main → renderer: run an AI control request. The renderer answers on `ai-action-response`. */
export const ipcAiActionRequestChannel = makeIpcChannelName('ai-action-request');
export type IpcAiActionRequestArgs = [reqId: number, req: AiRpcRequest];

export const ipcAiActionResponseChannel = makeIpcChannelName('ai-action-response');
export type IpcAiActionResponseArgs = [reqId: number, res: AiRpcResult];
export type IpcAiActionResponseRes = void;

export const ipcAiConfirmChannel = makeIpcChannelName('ai-confirm');
export type IpcAiConfirmArgs = [reqId: number, origin: AiOrigin, describe: string];
export type IpcAiConfirmRes = boolean;

/** renderer → main: the request is still wanted (not cancelled, not timed out); asked before a write runs without the box. */
export const ipcAiAliveChannel = makeIpcChannelName('ai-alive');
export type IpcAiAliveArgs = [reqId: number];
export type IpcAiAliveRes = boolean;

/** renderer → main: the app page now listens for ai-action-request. */
export const ipcAiReadyChannel = makeIpcChannelName('ai-ready');
export type IpcAiReadyArgs = [];
export type IpcAiReadyRes = void;

/** Shells in pseudo-terminals for in-app terminal views ('terminal-*' channels run the OS terminal app). */
export const ipcPtyCreateChannel = makeIpcChannelName('pty-create');
export type IpcPtyCreateArgs = [o: { cols: number; rows: number; shell?: string; cwd?: string; command?: string }];
export type IpcPtyCreateRes = { ok: true; terminalId: string } | { ok: false; message: string };

export const ipcPtyWriteChannel = makeIpcChannelName('pty-write');
export type IpcPtyWriteArgs = [terminalId: string, data: string];

export const ipcPtyResizeChannel = makeIpcChannelName('pty-resize');
export type IpcPtyResizeArgs = [terminalId: string, cols: number, rows: number];
export type IpcPtyResizeRes = void;

export const ipcPtyBufferChannel = makeIpcChannelName('pty-buffer');
export type IpcPtyBufferArgs = [terminalId: string];
/** The screen copy and the number of the last output chunk it covers. */
export type IpcPtyBufferRes = { screen: string; seq: number } | undefined;

/** A shell a new terminal tab can run (found on this computer). */
export interface ShellOption { label: string; shell: string }
export const ipcPtyShellsChannel = makeIpcChannelName('pty-shells');
export type IpcPtyShellsArgs = [];
export type IpcPtyShellsRes = ShellOption[];

export const ipcPtyKillChannel = makeIpcChannelName('pty-kill');
export type IpcPtyKillArgs = [terminalId: string];
export type IpcPtyKillRes = void;

/** main → renderer: output of a terminal (batched) and its exit. */
export const ipcPtyDataChannel = makeIpcChannelName('pty-data');
export type IpcPtyDataArgs = [terminalId: string, data: string, seq: number];
/** main → renderer: the title a terminal's shell set. */
export const ipcPtyTitleChannel = makeIpcChannelName('pty-title');
export type IpcPtyTitleArgs = [terminalId: string, title: string];
export const ipcPtyExitChannel = makeIpcChannelName('pty-exit');
export type IpcPtyExitArgs = [terminalId: string, exitCode: number];

