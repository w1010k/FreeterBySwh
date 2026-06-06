/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry } from '@common/base/fs';

/**
 * @pierre/trees is path-first: each tree row is identified by a POSIX-style
 * path, and a trailing `/` marks a directory (verified empirically). Because
 * absolute OS paths can use `\` and drive letters (Windows) that break the
 * tree's `/`-segment nesting, we build synthetic relative keys from entry
 * names and keep a separate map from key → absolute OS path for opening.
 */

export interface BuiltEntry {
  /** Stable id for an entry: its relative path with NO trailing slash. */
  key: string;
  /** Absolute OS path, used to open / reveal the entry. */
  path: string;
  isDirectory: boolean;
  /** Size in bytes (files only). */
  size: number;
}

export interface BuiltEntries {
  /** Paths to feed the tree model (directories carry a trailing `/`). */
  treePaths: string[];
  entries: BuiltEntry[];
}

/** Strip a trailing slash so a tree row id maps back to a stable key. */
export function toMapKey(treePath: string): string {
  return treePath.replace(/\/+$/, '');
}

/** The tree path for a key, adding a trailing `/` for directories. */
export function toTreePath(key: string, isDirectory: boolean): string {
  return isDirectory ? `${key}/` : key;
}

/** Last path segment of an absolute OS path (handles both `/` and `\`). */
export function basenameOf(path: string): string {
  const segments = path.split(/[/\\]/).filter(s => s !== '');
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

/**
 * Parent directory of an absolute OS path (handles both `/` and `\`). A trailing
 * separator is ignored. Falls back to the path itself when there is no parent
 * segment (e.g. a bare root) — tree entries are always nested under a favorite
 * root, so that fallback doesn't arise in practice.
 */
export function dirnameOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}

/**
 * Pick a tree key for `base` that isn't already in `used`, appending ` (2)`,
 * ` (3)`, … on collision. Mutates `used` with the chosen key.
 */
export function dedupeKey(used: Set<string>, base: string): string {
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base} (${n})`;
    n += 1;
  }
  used.add(key);
  return key;
}

/**
 * Build the root-level entries from the user's configured favorite folder
 * paths. Each becomes a top-level directory node labelled by its basename
 * (disambiguated on collision); children are loaded lazily on expand.
 */
export function buildRootEntries(favoritePaths: readonly string[]): BuiltEntries {
  const used = new Set<string>();
  const entries: BuiltEntry[] = favoritePaths
    .map(p => p.trim())
    .filter(p => p !== '')
    .map(path => ({ key: dedupeKey(used, basenameOf(path)), path, isDirectory: true, size: 0 }));
  return {
    entries,
    treePaths: entries.map(e => toTreePath(e.key, e.isDirectory))
  };
}

/**
 * Build the tree paths + key/abs entries for the children of a directory.
 * `parentKey` is `''` for the root, or a directory's key (e.g. `foo/bar`).
 */
export function buildEntryPaths(parentKey: string, dirEntries: FsDirEntry[]): BuiltEntries {
  const entries: BuiltEntry[] = dirEntries.map(entry => {
    const key = parentKey === '' ? entry.name : `${parentKey}/${entry.name}`;
    return { key, path: entry.path, isDirectory: entry.isDirectory, size: entry.size };
  });
  return {
    entries,
    treePaths: entries.map(e => toTreePath(e.key, e.isDirectory))
  };
}

/** Human-readable file size, e.g. `0 B`, `820 B`, `1.4 KB`, `3 MB`. */
export function humanFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
