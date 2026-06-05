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
