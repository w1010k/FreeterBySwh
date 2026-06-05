/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
})
