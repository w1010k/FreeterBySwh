/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface ReleaseProvider {
  /** The tag of the latest published release, e.g. `v2.8.0-swh.29`. Rejects when it cannot be read. */
  getLatestTag(): Promise<string>;
}
