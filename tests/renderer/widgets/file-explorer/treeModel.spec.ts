/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { basenameOf, buildEntryPaths, buildRootEntries, dedupeKey, dirnameOf, humanFileSize, toMapKey, toTreePath } from '@/widgets/file-explorer/treeModel';
import { FsDirEntry } from '@common/base/fs';

const entry = (name: string, isDirectory: boolean, path: string, size = 0): FsDirEntry => ({ name, isDirectory, path, size });

describe('file-explorer treeModel', () => {
  describe('toMapKey()', () => {
    it('should strip a trailing slash', () => {
      expect(toMapKey('foo/')).toBe('foo');
      expect(toMapKey('foo/bar/')).toBe('foo/bar');
    })
    it('should leave a file key unchanged', () => {
      expect(toMapKey('foo/bar.txt')).toBe('foo/bar.txt');
    })
  })

  describe('toTreePath()', () => {
    it('should add a trailing slash for directories only', () => {
      expect(toTreePath('foo', true)).toBe('foo/');
      expect(toTreePath('foo/bar.txt', false)).toBe('foo/bar.txt');
    })
  })

  describe('buildEntryPaths()', () => {
    it('should build root-level keys and tree paths (dirs get a trailing slash)', () => {
      const built = buildEntryPaths('', [
        entry('sub', true, '/root/sub'),
        entry('a.txt', false, '/root/a.txt', 42),
      ]);

      expect(built.treePaths).toEqual(['sub/', 'a.txt']);
      expect(built.entries).toEqual([
        { key: 'sub', path: '/root/sub', isDirectory: true, size: 0 },
        { key: 'a.txt', path: '/root/a.txt', isDirectory: false, size: 42 },
      ]);
    })

    it('should nest child keys under the parent key', () => {
      const built = buildEntryPaths('sub', [
        entry('deep', true, '/root/sub/deep'),
        entry('b.txt', false, '/root/sub/b.txt'),
      ]);

      expect(built.treePaths).toEqual(['sub/deep/', 'sub/b.txt']);
      expect(built.entries.map(e => e.key)).toEqual(['sub/deep', 'sub/b.txt']);
    })

    it('should return empty results for an empty directory', () => {
      expect(buildEntryPaths('sub', [])).toEqual({ treePaths: [], entries: [] });
    })
  })

  describe('basenameOf()', () => {
    it('should return the last segment for posix and windows paths', () => {
      expect(basenameOf('/home/user/Downloads')).toBe('Downloads');
      expect(basenameOf('C:\\Users\\swh\\Documents')).toBe('Documents');
      expect(basenameOf('/home/user/Downloads/')).toBe('Downloads');
    })
  })

  describe('dirnameOf()', () => {
    it('should return the parent directory for posix and windows paths', () => {
      expect(dirnameOf('/home/user/Downloads/a.txt')).toBe('/home/user/Downloads');
      expect(dirnameOf('C:\\Users\\swh\\a.txt')).toBe('C:\\Users\\swh');
    })
    it('should ignore a trailing separator', () => {
      expect(dirnameOf('/home/user/sub/')).toBe('/home/user');
    })
  })

  describe('dedupeKey()', () => {
    it('should append a counter on collision and record the chosen key', () => {
      const used = new Set<string>();
      expect(dedupeKey(used, 'src')).toBe('src');
      expect(dedupeKey(used, 'src')).toBe('src (2)');
      expect(dedupeKey(used, 'src')).toBe('src (3)');
      expect(used.has('src (2)')).toBe(true);
    })
  })

  describe('buildRootEntries()', () => {
    it('should build directory roots labelled by basename, skipping blanks', () => {
      const built = buildRootEntries(['/home/user/Downloads', '', '  ', '/home/user/Documents']);

      expect(built.treePaths).toEqual(['Downloads/', 'Documents/']);
      expect(built.entries).toEqual([
        { key: 'Downloads', path: '/home/user/Downloads', isDirectory: true, size: 0 },
        { key: 'Documents', path: '/home/user/Documents', isDirectory: true, size: 0 },
      ]);
    })

    it('should disambiguate roots that share a basename', () => {
      const built = buildRootEntries(['/a/src', '/b/src']);

      expect(built.treePaths).toEqual(['src/', 'src (2)/']);
      expect(built.entries.map(e => e.path)).toEqual(['/a/src', '/b/src']);
    })
  })

  describe('humanFileSize()', () => {
    it('should format bytes below 1 KB as plain bytes', () => {
      expect(humanFileSize(0)).toBe('0 B');
      expect(humanFileSize(820)).toBe('820 B');
      expect(humanFileSize(1023)).toBe('1023 B');
    })
    it('should use one decimal under 10 of a unit, none at/above', () => {
      expect(humanFileSize(1024)).toBe('1.0 KB');
      expect(humanFileSize(1536)).toBe('1.5 KB');
      expect(humanFileSize(15 * 1024)).toBe('15 KB');
    })
    it('should scale up through MB/GB', () => {
      expect(humanFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
      expect(humanFileSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
    })
  })
})
