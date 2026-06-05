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

/**
 * Options for listing a directory. Omitted fields fall back to the
 * backward-compatible defaults (include everything, collect sizes).
 */
export interface ReadDirOptions {
  /**
   * Include dot-prefixed (hidden) entries. Defaults to `true` (no filtering).
   * Hidden detection uses the POSIX dot-prefix convention on every platform —
   * Windows' hidden file *attribute* is intentionally not consulted (reading it
   * would require native bindings), so e.g. a non-dotted file flagged hidden on
   * Windows still shows.
   */
  includeHidden?: boolean;
  /**
   * Collect each file's byte size via `stat()`. Defaults to `true`. Pass
   * `false` to skip the per-file `stat()` syscall when sizes won't be shown
   * (a meaningful speedup on large directories); files then report `size: 0`.
   */
  includeSizes?: boolean;
}
