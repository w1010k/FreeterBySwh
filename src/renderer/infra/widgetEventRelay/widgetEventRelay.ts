/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { SHARED_DATA_CHANGED_EVENT, SharedDataChangedEventDetail } from '@/base/sharedDataEvents';
import { WEBPAGE_GO_HOME_EVENT, WebpageGoHomeEventDetail } from '@/widgets/webpage/homeEvents';
import { WEBPAGE_WINDOW_BLOCKED_EVENT, WebpageWindowBlockedEventDetail } from '@/widgets/webpage/windowBlockedEvents';
import { WEBPAGE_ZOOM_EVENT, WebpageZoomEventDetail } from '@/widgets/webpage/zoomEvents';
import {
  ipcGoHomeWebpageChannel,
  ipcSharedDataChangedChannel,
  ipcWebpageWindowBlockedChannel,
  ipcWebpageWindowBlockedReasons,
  ipcZoomWebpageChannel,
  ipcZoomWebpageDirections
} from '@common/ipc/channels';

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return (values as readonly unknown[]).includes(value);
}

function dispatch<T>(eventName: string, detail: T) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Re-emits main's widget signals as window CustomEvents, so a widget subscribes without IPC wiring of its own and
 * picks its messages by `webContentsId` (Webpage) or widget type and key (shared data). Arguments are checked here,
 * since they cross the process seam. Call once at startup: the listeners live for the app's lifetime.
 */
export function startWidgetEventRelay(): void {
  // CmdOrCtrl+Shift+=/-/0 in a Webpage widget's <webview>, caught in main (D21).
  electronIpcRenderer.on(ipcZoomWebpageChannel, (webContentsId, direction) => {
    if (typeof webContentsId === 'number' && isOneOf(ipcZoomWebpageDirections, direction)) {
      dispatch<WebpageZoomEventDetail>(WEBPAGE_ZOOM_EVENT, { webContentsId, direction });
    }
  });

  // Alt+Home in a Webpage widget's <webview>: the start page URL lives in renderer-side widget settings.
  electronIpcRenderer.on(ipcGoHomeWebpageChannel, (webContentsId) => {
    if (typeof webContentsId === 'number') {
      dispatch<WebpageGoHomeEventDetail>(WEBPAGE_GO_HOME_EVENT, { webContentsId });
    }
  });

  // A webview page's request that main did not open (a new window, an app link): the widget shows a notice (D81).
  electronIpcRenderer.on(ipcWebpageWindowBlockedChannel, (webContentsId, url, reason) => {
    if (typeof webContentsId === 'number' && typeof url === 'string' && isOneOf(ipcWebpageWindowBlockedReasons, reason)) {
      dispatch<WebpageWindowBlockedEventDetail>(WEBPAGE_WINDOW_BLOCKED_EVENT, { webContentsId, url, reason });
    }
  });

  // A write to a shared data key: widgets sharing that key reload (D33).
  electronIpcRenderer.on(ipcSharedDataChangedChannel, (widgetType, sharedKeyId) => {
    if (typeof widgetType === 'string' && typeof sharedKeyId === 'string') {
      dispatch<SharedDataChangedEventDetail>(SHARED_DATA_CHANGED_EVENT, { widgetType, sharedKeyId });
    }
  });
}
