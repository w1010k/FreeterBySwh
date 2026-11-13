/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { isAllowedExternalUrl } from '@common/helpers/isAllowedExternalUrl';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';
import { IpcWebpageWindowBlockedReason } from '@common/ipc/channels';

const rePopupFeatures = /\bpopup\b/i;

export type WindowOpenDecision =
  /** An in-app popup window. */
  | { kind: 'popup' }
  /** The user's default browser (a "new tab" link). */
  | { kind: 'external'; url: string }
  /** Not opened; the widget tells the user. */
  | { kind: 'blocked'; reason: IpcWebpageWindowBlockedReason };

/**
 * What to do with a new-window request from a guest page (a <webview>, or an in-app popup it opened):
 * - "new tab" intents (`<a target="_blank">`, `window.open(url)`, middle-click) go to the default browser, web and mail
 *   schemes only (CHANGES #88); any other scheme is blocked.
 * - real popups (`popup` / size features, disposition `new-window`) open in the app, so OAuth flows can talk to their
 *   opener through `window.opener.postMessage`.
 * - an empty window (`window.open('', '_blank')`, `about:blank`) opens in the app too: the page fills it or sets its
 *   address afterwards (sign-in, payment, print flows), so it needs the window it gets back. The default browser could
 *   not give it one; this used to be dropped, and pages then said "pop-up blocked".
 * - at most `maxPopups` in-app popups per guest tree, so a page can't flood the screen.
 */
export function decideWindowOpen(req: { url: string; disposition: string; features: string; openPopups: number; maxPopups: number }): WindowOpenDecision {
  const isBlank = req.url === '' || req.url === 'about:blank';
  const isRealPopup = isBlank || req.disposition === 'new-window' || rePopupFeatures.test(req.features);
  if (!isRealPopup) {
    const sanitUrl = sanitizeUrl(req.url);
    return sanitUrl && isAllowedExternalUrl(sanitUrl)
      ? { kind: 'external', url: sanitUrl }
      : { kind: 'blocked', reason: 'scheme' };
  }
  if (req.openPopups >= req.maxPopups) {
    return { kind: 'blocked', reason: 'popupLimit' };
  }
  return { kind: 'popup' };
}
