/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcWebpageWindowBlockedReason, maxPopupsPerGuest } from '@common/ipc/channels';
import { isAllowedExternalUrl, isOpenableAppLink } from '@common/helpers/isAllowedExternalUrl';

/** Re-emitted by init.ts from main's `webpage-window-blocked`; the widget whose webview it names shows a notice. */
export const WEBPAGE_WINDOW_BLOCKED_EVENT = 'freeter:webpage-window-blocked';

export interface WebpageWindowBlockedEventDetail {
  webContentsId: number;
  url: string;
  reason: IpcWebpageWindowBlockedReason;
}

export interface BlockedWindowNotice {
  text: string;
  /** The button: its label and the address it opens (the parsed URL, as checked here). */
  action?: { label: string; url: string };
}

/**
 * The notice for a blocked request. This is the only check of what the button opens: the widget opens it with the
 * shell API, which takes any scheme (Link Opener's app links), so only web addresses and meeting or chat app links
 * get a button.
 */
export function describeBlockedWindow({ url, reason }: Pick<WebpageWindowBlockedEventDetail, 'url' | 'reason'>): BlockedWindowNotice {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all (or not sent, too long): no scheme to name and no button.
  }
  if (reason === 'popupLimit') {
    return {
      text: `This page tried to open another window, but it already has ${maxPopupsPerGuest} open. Close one and try again.`,
      // Only a web address can go to the browser instead; an empty window needs the page that opened it.
      action: parsed && isAllowedExternalUrl(parsed.href) ? { label: 'Open in browser', url: parsed.href } : undefined
    };
  }
  const scheme = parsed?.protocol ?? '';
  // The scheme is shown as is, so the user sees exactly which kind of app is about to open.
  return parsed && isOpenableAppLink(parsed.href)
    ? { text: `This page wants to open an app (${scheme} link).`, action: { label: `Open ${scheme} link`, url: parsed.href } }
    : { text: `This page tried to open ${scheme ? `a ${scheme} link` : 'a link'}. Freeter does not open it from a page.` };
}
