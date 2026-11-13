/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isAllowedExternalUrl } from '@common/helpers/isAllowedExternalUrl';
import { app, session as electronSession, Session, WebContents } from 'electron';

/**
 * Decides one session permission request. Only `openExternal` is filtered: a
 * web page that navigates its own frame to an app protocol (a target-less
 * `<a href="slack://...">`, `location.href = 'ms-settings:...'`) raises this
 * request with the target in `externalURL`, and Electron grants every request
 * when no handler is set. Every other permission stays granted, which is
 * Electron's default, so notifications, camera/mic and the like keep working.
 */
export function shouldGrantPermission(permission: string, externalURL: string | undefined): boolean {
  if (permission === 'openExternal') {
    return isAllowedExternalUrl(externalURL ?? '');
  }
  return true;
}

/**
 * Installs the handler on the default session and on every session created
 * later. Webview partitions are created lazily when a webview first loads, so
 * this must run before any window or webview exists (same pattern as the
 * download manager). A session holds a single handler: another
 * `setPermissionRequestHandler` call on the same session would replace this one.
 */
export function registerPermissionHandler(onExternalDenied: (webContents: WebContents, url: string) => void): void {
  const attach = (ses: Session) => {
    ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const externalURL = 'externalURL' in details ? details.externalURL : undefined;
      const granted = shouldGrantPermission(permission, externalURL);
      // A page in its own frame (`location.href = 'zoommtg:...'`, an iframe): the Webpage widget tells the user, who may
      // open a meeting or chat app link from there.
      if (!granted && permission === 'openExternal' && externalURL) {
        onExternalDenied(webContents, externalURL);
      }
      callback(granted);
    });
  };
  attach(electronSession.defaultSession);
  app.on('session-created', attach);
}
