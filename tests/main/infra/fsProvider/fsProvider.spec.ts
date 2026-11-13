/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFsProvider } from '@/infra/fsProvider/fsProvider';

let dirPath: string;

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), 'freeter-fs-'));
})

afterEach(async () => {
  await rm(dirPath, { recursive: true, force: true });
})

describe('FsProvider', () => {
  describe('search()', () => {
    const limits = { includeHidden: true, maxResults: 200, maxScanned: 50000 };
    const names = (hits: { path: string }[]) => hits.map(h => h.path.slice(dirPath.length + 1).replace(/\\/g, '/')).sort();

    it('finds files and folders in every subfolder whose name contains the query, ignoring case', async () => {
      await mkdir(join(dirPath, 'a', 'b', 'Report'), { recursive: true });
      await writeFile(join(dirPath, 'a', 'b', 'Report', 'q3-REPORT.txt'), '');
      await writeFile(join(dirPath, 'a', 'other.txt'), '');
      const provider = createFsProvider();

      const res = await provider.search([dirPath], 'report', limits);

      expect(names(res.hits)).toEqual(['a/b/Report', 'a/b/Report/q3-REPORT.txt']);
      expect(res.hits.find(h => h.name === 'Report')).toMatchObject({ isDirectory: true, rootIndex: 0, folder: 'a/b' });
      expect(res.hits.find(h => h.name === 'q3-REPORT.txt')).toMatchObject({ folder: 'a/b/Report' });
      expect(res.limit).toBeNull();
    });

    it('matches a Korean name stored decomposed (NFD, as macOS does) with an NFC query', async () => {
      await writeFile(join(dirPath, '\u1112\u1161\u11ab\u1100\u1173\u11af.txt'), '');
      const provider = createFsProvider();

      const res = await provider.search([dirPath], '한글', limits);

      expect(res.hits).toHaveLength(1);
    });

    it('tells which root each hit is under', async () => {
      const second = join(dirPath, 'second');
      await mkdir(join(dirPath, 'first'));
      await mkdir(second);
      await writeFile(join(second, 'x.txt'), '');
      const provider = createFsProvider();

      const res = await provider.search([join(dirPath, 'first'), second], 'x', limits);

      expect(res.hits).toEqual([{ name: 'x.txt', path: join(second, 'x.txt'), isDirectory: false, rootIndex: 1, folder: '' }]);
    });

    it('skips dot-prefixed entries and their contents when includeHidden is false', async () => {
      await mkdir(join(dirPath, '.git'));
      await writeFile(join(dirPath, '.git', 'match'), '');
      await writeFile(join(dirPath, '.match'), '');
      await writeFile(join(dirPath, 'match'), '');
      const provider = createFsProvider();

      const res = await provider.search([dirPath], 'match', { ...limits, includeHidden: false });

      expect(names(res.hits)).toEqual(['match']);
    });

    it('stops at maxResults and reports the results limit', async () => {
      await Promise.all(['m1', 'm2', 'm3'].map(n => writeFile(join(dirPath, n), '')));
      const provider = createFsProvider();

      const res = await provider.search([dirPath], 'm', { ...limits, maxResults: 2 });

      expect(res.hits).toHaveLength(2);
      expect(res.limit).toBe('results');
    });

    it('stops at maxScanned and reports the scan limit, also with no hits', async () => {
      await mkdir(join(dirPath, 'deep'));
      await writeFile(join(dirPath, 'deep', 'match'), '');
      await Promise.all(['a', 'b', 'c'].map(n => writeFile(join(dirPath, n), '')));
      const provider = createFsProvider();

      // 4 entries at the top level use up the limit before 'deep' is read.
      const res = await provider.search([dirPath], 'match', { ...limits, maxScanned: 4 });

      expect(res.hits).toEqual([]);
      expect(res.limit).toBe('scanned');
    });

    it('searches the shallow levels of every root before going deeper', async () => {
      const r1 = join(dirPath, 'r1');
      const r2 = join(dirPath, 'r2');
      await mkdir(join(r1, 'd1', 'd2'), { recursive: true });
      await writeFile(join(r1, 'd1', 'd2', 'match-deep'), '');
      await mkdir(r2);
      await writeFile(join(r2, 'match-top'), '');
      const provider = createFsProvider();

      const res = await provider.search([r1, r2], 'match', { ...limits, maxResults: 1 });

      expect(res.hits.map(h => h.name)).toEqual(['match-top']);
    });

    it('does not enter a symlinked folder (no loops)', async () => {
      await mkdir(join(dirPath, 'real'));
      await writeFile(join(dirPath, 'real', 'match'), '');
      try {
        await symlink(join(dirPath, 'real'), join(dirPath, 'link'), 'junction');
      } catch {
        return; // No permission to create links here: nothing to check.
      }
      const provider = createFsProvider();

      const res = await provider.search([dirPath], 'match', limits);

      expect(names(res.hits)).toEqual(['real/match']);
    });

    it('skips folders it cannot read and searches the rest', async () => {
      await writeFile(join(dirPath, 'match'), '');
      const provider = createFsProvider();

      const res = await provider.search([join(dirPath, 'missing'), dirPath], 'match', limits);

      expect(res.hits).toEqual([{ name: 'match', path: join(dirPath, 'match'), isDirectory: false, rootIndex: 1, folder: '' }]);
    });

    it('reads a folder reached from overlapping roots once, under the deeper root', async () => {
      const docs = join(dirPath, 'Docs');
      await mkdir(join(docs, 'sub'), { recursive: true });
      await writeFile(join(docs, 'sub', 'match'), '');
      const provider = createFsProvider();

      // The same folder twice, and a folder inside another root.
      const res = await provider.search([dirPath, docs, dirPath + '/'], 'match', limits);

      expect(res.hits).toEqual([{ name: 'match', path: join(docs, 'sub', 'match'), isDirectory: false, rootIndex: 1, folder: 'sub' }]);
    });
  });

  describe('readDir()', () => {
    it('should list files and subdirectories with name, absolute path and isDirectory flag', async () => {
      await writeFile(join(dirPath, 'file.txt'), 'hello');
      await mkdir(join(dirPath, 'sub'));
      const provider = createFsProvider();

      const entries = (await provider.readDir(dirPath)).sort((a, b) => a.name.localeCompare(b.name));

      expect(entries).toEqual([
        { name: 'file.txt', path: join(dirPath, 'file.txt'), isDirectory: false, size: 5 },
        { name: 'sub', path: join(dirPath, 'sub'), isDirectory: true, size: 0 },
      ]);
    })

    it('should return an empty array for an empty directory', async () => {
      const provider = createFsProvider();

      expect(await provider.readDir(dirPath)).toEqual([]);
    })

    it('should include dot-prefixed entries by default', async () => {
      await writeFile(join(dirPath, '.hidden'), 'x');
      await writeFile(join(dirPath, 'visible.txt'), 'x');
      const provider = createFsProvider();

      const names = (await provider.readDir(dirPath)).map(e => e.name).sort();

      expect(names).toEqual(['.hidden', 'visible.txt']);
    })

    it('should omit dot-prefixed entries when includeHidden is false', async () => {
      await writeFile(join(dirPath, '.hidden'), 'x');
      await mkdir(join(dirPath, '.git'));
      await writeFile(join(dirPath, 'visible.txt'), 'x');
      const provider = createFsProvider();

      const names = (await provider.readDir(dirPath, { includeHidden: false })).map(e => e.name).sort();

      expect(names).toEqual(['visible.txt']);
    })

    it('should report size 0 for files when includeSizes is false (skipping stat)', async () => {
      await writeFile(join(dirPath, 'file.txt'), 'hello');
      const provider = createFsProvider();

      const entries = await provider.readDir(dirPath, { includeSizes: false });

      expect(entries).toEqual([
        { name: 'file.txt', path: join(dirPath, 'file.txt'), isDirectory: false, size: 0 },
      ]);
    })

    it('should reject when the directory does not exist', async () => {
      const provider = createFsProvider();

      await expect(provider.readDir(join(dirPath, 'nope'))).rejects.toThrow();
    })
  })

  describe('getHomeDir()', () => {
    it('should return the OS home directory', () => {
      const provider = createFsProvider();

      expect(provider.getHomeDir()).toBe(homedir());
    })
  })

  describe('getImageDataUrl()', () => {
    it('should read a supported image as a base64 data URL with the mime from its extension', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'bg.png');
      await writeFile(path, Buffer.from([1, 2, 3, 4]));

      expect(await provider.getImageDataUrl(path)).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3, 4]).toString('base64')}`);
    })

    it('should return null for an unsupported extension (without reading the file)', async () => {
      const provider = createFsProvider();

      expect(await provider.getImageDataUrl(join(dirPath, 'note.txt'))).toBeNull();
    })

    it('should return null when the file does not exist', async () => {
      const provider = createFsProvider();

      expect(await provider.getImageDataUrl(join(dirPath, 'missing.png'))).toBeNull();
    })
  })

})
