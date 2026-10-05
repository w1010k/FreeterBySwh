/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Schemes that a URL coming from web content (a Webpage widget's guest page)
// may carry when it is handed to the OS via `shell.openExternal`. Any other
// scheme (file:, javascript:, app protocols like slack: or ms-settings:) could
// open a local file or launch an app, so callers drop it. User-configured URLs
// (Link Opener, Web Query, app menu) skip this check on purpose: the user chose
// those targets, and app deep links such as obsidian: are intended there.
const allowedExternalSchemes = new Set(['http:', 'https:', 'mailto:']);

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
