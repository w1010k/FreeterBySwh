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

export interface FsSearchOptions {
  /** Include dot-prefixed entries, as `ReadDirOptions.includeHidden`. Defaults to `true`. */
  includeHidden?: boolean;
}

/** A file or folder whose name contains the query. */
export interface FsSearchHit {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Index of the searched root the hit is under. */
  rootIndex: number;
  /** The folders between that root and the hit, `/`-separated; `''` for a hit directly in the root. */
  folder: string;
}

export interface FsSearchResult {
  hits: FsSearchHit[];
  /**
   * The limit the search stopped at, or null when it searched everything. `results`: more matches may exist (a longer
   * query helps). `scanned`: some folders were not searched at all (a longer query does not help).
   */
  limit: 'results' | 'scanned' | null;
}
