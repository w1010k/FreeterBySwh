/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Schemes that a URL coming from web content (a Webpage widget's guest page)
// may carry when it is handed to the OS via `shell.openExternal`. Any other
// scheme (file:, javascript:, app protocols like slack: or ms-settings:) could
// open a local file or launch an app, so callers drop it (the Webpage widget may
// then offer a meeting or chat app link on a button: `isOpenableAppLink`). User-configured URLs
// (Link Opener, Web Query, app menu) skip this check on purpose: the user chose
// those targets, and app deep links such as obsidian: are intended there.
const allowedExternalSchemes = new Set(['http:', 'https:', 'mailto:']);

// App links the Webpage widget offers to open after the user clicks its button (a page's blocked request): meeting and
// chat apps. Other app protocols (ms-*, search-ms:, file:, ...) can start programs or open local files, so the widget
// only reports them.
const openableAppLinkSchemes = new Set(['zoommtg:', 'zoomus:', 'msteams:', 'slack:', 'webex:', 'tel:']);

export function isOpenableAppLink(url: string): boolean {
  try {
    return openableAppLinkSchemes.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Returns true when `url` parses as an absolute URL whose scheme is in the
 * allowlist above. Unparsable input returns false.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return allowedExternalSchemes.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
