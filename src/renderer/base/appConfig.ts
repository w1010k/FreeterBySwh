/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { MemSaverConfigApp } from '@/base/memSaver';

export type WorktableBgImageMode = 'cover' | 'contain' | 'center' | 'tile';

export interface AppConfig {
  mainHotkey: string;
  memSaver: MemSaverConfigApp;
  uiTheme: string;
  /** Folder downloads are saved to. Empty = OS default (~/Downloads). */
  downloadDir: string;
  /** Custom worktable background color (CSS color). Empty = theme default. */
  bgColor: string;
  /** Custom worktable background image (absolute file path). Empty = none. */
  bgImage: string;
  /** How the background image is laid out. */
  bgImageMode: WorktableBgImageMode;
  /** Opacity of the custom background (color + image), 0–100. 100 = opaque. */
  bgOpacity: number;
}
