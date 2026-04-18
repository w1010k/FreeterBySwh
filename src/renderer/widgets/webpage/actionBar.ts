/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBarItem, ActionBarItems } from '@/base/actionBar';
import { canGoBack, canGoForward, canGoHome, canReload, copyCurrentAddress, goBack, goForward, goHome, labelAutoReloadStart, labelAutoReloadStop, labelCopyCurrentAddress, labelGoBack, labelGoForward, labelGoHome, labelOpenInBrowser, labelReload, labelZoomIn, labelZoomOut, openCurrentInBrowser, reload, zoomReset, zoomStepIn, zoomStepOut } from './actions';
import { backSvg, copyUrlSvg, forwardSvg, homeSvg, openInBrowserSvg, reloadSvg, reloadStartSvg, reloadStopSvg, zoomInSvg, zoomOutSvg } from './icons';
import { WidgetApi } from '@/base/widgetApi';

export function createActionBarItems(
  elWebview: Electron.WebviewTag | null,
  widgetApi: WidgetApi,
  homeUrl: string,
  autoReload: number,
  autoReloadStopped: boolean,
  setAutoReloadStopped: (val: boolean) => void
): ActionBarItems {
  if (!elWebview || !homeUrl) {
    return []
  }

  let reloadItems: ActionBarItem[] = [
    {
      enabled: canReload(),
      icon: reloadSvg,
      id: 'RELOAD',
      title: labelReload,
      // Manual reload from the action bar also resets zoom to 100%, so a
      // quick reload doubles as "start fresh". Auto-reload interval and the
      // context menu's Reload keep their zoom level on purpose: the former
      // would be annoying mid-session, the latter is the "surgical" path.
      doAction: async () => {
        zoomReset(elWebview);
        reload(elWebview);
      }
    }
  ];
  if (autoReload > 0) {
    reloadItems = [{
      enabled: canReload(),
      icon: autoReloadStopped ? reloadStartSvg : reloadStopSvg,
      id: 'AUTO-RELOAD',
      title: autoReloadStopped ? labelAutoReloadStart : labelAutoReloadStop,
      doAction: async () => setAutoReloadStopped(!autoReloadStopped)
    }, ...reloadItems]
  }

  return [
    {
      enabled: canGoHome(elWebview, homeUrl),
      icon: homeSvg,
      id: 'HOME',
      title: labelGoHome,
      doAction: async () => goHome(elWebview, homeUrl)
    },
    {
      enabled: canGoBack(elWebview),
      icon: backSvg,
      id: 'BACK',
      title: labelGoBack,
      doAction: async () => goBack(elWebview)
    },
    {
      enabled: canGoForward(elWebview),
      icon: forwardSvg,
      id: 'FORWARD',
      title: labelGoForward,
      doAction: async () => goForward(elWebview)
    },
    ...reloadItems,
    {
      enabled: true,
      icon: zoomOutSvg,
      id: 'ZOOM-OUT',
      title: labelZoomOut,
      doAction: async () => zoomStepOut(elWebview)
    },
    {
      enabled: true,
      icon: zoomInSvg,
      id: 'ZOOM-IN',
      title: labelZoomIn,
      doAction: async () => zoomStepIn(elWebview)
    },
    {
      enabled: true,
      icon: copyUrlSvg,
      id: 'COPY-URL',
      title: labelCopyCurrentAddress,
      doAction: async () => copyCurrentAddress(elWebview, widgetApi)
    },
    {
      enabled: true,
      icon: openInBrowserSvg,
      id: 'OPEN-IN-BROWSER',
      title: labelOpenInBrowser,
      doAction: async () => openCurrentInBrowser(elWebview, widgetApi)
    }
  ];
}
