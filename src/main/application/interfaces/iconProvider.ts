/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface IconProvider {
  /**
   * Pass `bypassCache=true` on user-initiated actions (e.g. a button click)
   * to force a retry that ignores previously-cached results.
   */
  getFileIcon: (path: string, bypassCache?: boolean) => Promise<string | null>;
  getFavicon: (url: string, bypassCache?: boolean) => Promise<string | null>;
}
