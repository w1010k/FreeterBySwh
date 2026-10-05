/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsDirEntry, isMarkdownPath } from '@common/base/fs';

// ponytail: toMapKey, toTreePath and basenameOf copy the File Explorer helpers
// (no widget imports another widget's folder). Extract a shared tree module
// when the two trees are merged.

/**
 * @pierre/trees identifies rows by POSIX-style paths, with a trailing `/` for
 * directories. Absolute OS paths (`\`, drive letters) break that nesting, so
 * rows use keys relative to the configured folder, built from entry names,
 * and a separate map turns a key back into the absolute path.
 */
export interface TreeEntry {
  /** Relative path from the configured folder, no trailing slash. */
  key: string;
  /** Absolute OS path. */
  path: string;
  isDirectory: boolean;
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
 * The tree entries for a directory's children: every subfolder and only the
 * Markdown files. `parentKey` is `''` for the configured folder itself.
 */
export function buildChildEntries(parentKey: string, dirEntries: FsDirEntry[]): TreeEntry[] {
  return dirEntries
    .filter(entry => entry.isDirectory || isMarkdownPath(entry.name))
    .map(entry => ({
      key: parentKey === '' ? entry.name : `${parentKey}/${entry.name}`,
      path: entry.path,
      isDirectory: entry.isDirectory
    }));
}

/** True when `key` is `ancestorKey` itself or lies anywhere below it. */
export function isSameOrDescendantKey(key: string, ancestorKey: string): boolean {
  return key === ancestorKey || key.startsWith(ancestorKey + '/');
}
