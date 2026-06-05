/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * A single entry returned when listing a directory. `path` is the absolute
 * OS path of the entry; `name` is its basename; `size` is the byte size.
 */
export interface FsDirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Size in bytes for files; `0` for directories (or when stat fails). */
  size: number;
}
