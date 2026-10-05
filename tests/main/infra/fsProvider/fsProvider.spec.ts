/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, mkdir, writeFile, rm, readFile, stat, symlink, lstat, chmod } from 'node:fs/promises';
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

  describe('readTextFile()', () => {
    it('should read a Markdown file as text with its mtime', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'doc.md');
      await writeFile(path, '# 제목');

      const res = await provider.readTextFile(path);

      expect(res).toEqual({ text: '# 제목', mtimeMs: (await stat(path)).mtimeMs });
    })

    it('should refuse a non-Markdown file', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'secret.txt');
      await writeFile(path, 'x');

      expect(await provider.readTextFile(path)).toBeNull();
    })

    it('should return null for a missing file or a folder named like Markdown', async () => {
      const provider = createFsProvider();
      await mkdir(join(dirPath, 'dir.md'));

      expect(await provider.readTextFile(join(dirPath, 'missing.md'))).toBeNull();
      expect(await provider.readTextFile(join(dirPath, 'dir.md'))).toBeNull();
    })

    it('should return null for a file over 10 MB', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'big.md');
      await writeFile(path, Buffer.alloc(10 * 1024 * 1024 + 1, 0x61));

      expect(await provider.readTextFile(path)).toBeNull();
    })
  })

  describe('writeTextFile()', () => {
    it('should overwrite an existing Markdown file and return its new mtime', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'doc.MD');
      await writeFile(path, 'old');

      const mtime = await provider.writeTextFile(path, 'new');

      expect(await readFile(path, 'utf-8')).toBe('new');
      expect(mtime).toBe((await stat(path)).mtimeMs);
    })

    it('should refuse to create a missing file', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'new.md');

      expect(await provider.writeTextFile(path, 'x')).toBeNull();
      await expect(stat(path)).rejects.toThrow();
    })

    it('should refuse a non-Markdown file and leave it untouched', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'config.json');
      await writeFile(path, '{}');

      expect(await provider.writeTextFile(path, 'x')).toBeNull();
      expect(await readFile(path, 'utf-8')).toBe('{}');
    })

    it('should write through a symlink and keep the link', async () => {
      const provider = createFsProvider();
      const target = join(dirPath, 'real.md');
      const link = join(dirPath, 'link.md');
      await writeFile(target, 'old');
      try {
        await symlink(target, link);
      } catch {
        // Creating symlinks needs a privilege this machine may lack (Windows without developer mode).
        return;
      }

      expect(await provider.writeTextFile(link, 'new')).not.toBeNull();

      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readFile(target, 'utf-8')).toBe('new');
    })

    // Windows has no POSIX permission bits to keep.
    const itOnPosix = process.platform === 'win32' ? it.skip : it;
    itOnPosix('should keep the permission bits of the file it replaces', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'private.md');
      await writeFile(path, 'old');
      await chmod(path, 0o600);

      await provider.writeTextFile(path, 'new');

      expect((await stat(path)).mode & 0o777).toBe(0o600);
    })

    it('should apply overlapping writes in call order', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'doc.md');
      await writeFile(path, '');

      await Promise.all([provider.writeTextFile(path, 'a'), provider.writeTextFile(path, 'b')]);

      expect(await readFile(path, 'utf-8')).toBe('b');
    })
  })

  describe('getMtime()', () => {
    it('should return the mtime of a file, null for a missing path or a folder', async () => {
      const provider = createFsProvider();
      const path = join(dirPath, 'doc.md');
      await writeFile(path, 'x');

      expect(await provider.getMtime(path)).toBe((await stat(path)).mtimeMs);
      expect(await provider.getMtime(join(dirPath, 'missing.md'))).toBeNull();
      expect(await provider.getMtime(dirPath)).toBeNull();
    })
  })
})
