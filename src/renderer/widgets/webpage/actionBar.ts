/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBarItem, ActionBarItems } from '@/base/actionBar';
import { canGoBack, canGoForward, canGoHome, canReload, copyCurrentAddress, goBack, goForward, goHome, labelAutoReloadStart, labelAutoReloadStop, labelCopyCurrentAddress, labelGoBack, labelGoForward, labelGoHome, labelMuteAudio, labelOpenInBrowser, labelReload, labelUnmuteAudio, labelZoomIn, labelZoomOut, openCurrentInBrowser, reload, zoomReset, zoomStepIn, zoomStepOut } from './actions';
import { backSvg, copyUrlSvg, forwardSvg, homeSvg, openInBrowserSvg, reloadSvg, reloadStartSvg, reloadStopSvg, volumeOffSvg, volumeOnSvg, zoomInSvg, zoomOutSvg } from './icons';
import { WidgetApi } from '@/base/widgetApi';

export function createActionBarItems(
  elWebview: Electron.WebviewTag | null,
  widgetApi: WidgetApi,
  homeUrl: string,
  autoReload: number,
  autoReloadStopped: boolean,
  setAutoReloadStopped: (val: boolean) => void,
  // Optional capabilities wired by the widget component. When omitted (e.g. in
  // unit tests of the core buttons) the corresponding button is not rendered.
  audioMuted = false,
  onToggleMute?: () => void
): ActionBarItems {
  if (!elWebview || !homeUrl) {
    return []
  }

  // Append the bound keyboard shortcut to each button's hover tooltip so the
  // action bar doubles as a shortcut cheat-sheet. Only buttons that actually
  // have a binding get a hint (Reload / Copy / Auto-reload have none). The
  // modifier follows the OS: Cmd on macOS, Ctrl elsewhere. Arrows match what
  // browsers show.
  const { isMac } = widgetApi.process.getProcessInfo();
  const mod = isMac ? 'Cmd' : 'Ctrl';
  const withKeys = (label: string, keys: string) => `${label} (${keys})`;

  let reloadItems: ActionBarItem[] = [
    {
      enabled: canReload(),
      icon: reloadSvg,
      id: 'RELOAD',
      title: withKeys(labelReload, `F5 · ${mod}+R`),
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
      title: withKeys(labelGoHome, 'Alt+Home'),
      doAction: async () => goHome(elWebview, homeUrl)
    },
    {
      enabled: canGoBack(elWebview),
      icon: backSvg,
      id: 'BACK',
      title: withKeys(labelGoBack, 'Alt+←'),
      doAction: async () => goBack(elWebview)
    },
    {
      enabled: canGoForward(elWebview),
      icon: forwardSvg,
      id: 'FORWARD',
      title: withKeys(labelGoForward, 'Alt+→'),
      doAction: async () => goForward(elWebview)
    },
    ...reloadItems,
    {
      enabled: true,
      icon: zoomOutSvg,
      id: 'ZOOM-OUT',
      title: withKeys(labelZoomOut, `${mod}+-`),
      doAction: async () => zoomStepOut(elWebview)
    },
    {
      enabled: true,
      icon: zoomInSvg,
      id: 'ZOOM-IN',
      title: withKeys(labelZoomIn, `${mod}++`),
      doAction: async () => zoomStepIn(elWebview)
    },
    ...(onToggleMute ? [{
      enabled: true,
      icon: audioMuted ? volumeOffSvg : volumeOnSvg,
      id: 'MUTE',
      title: audioMuted ? labelUnmuteAudio : labelMuteAudio,
      doAction: async () => onToggleMute()
    }] : []),
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
      title: withKeys(labelOpenInBrowser, `${mod}+T`),
      doAction: async () => openCurrentInBrowser(elWebview, widgetApi)
    }
  ];
}
