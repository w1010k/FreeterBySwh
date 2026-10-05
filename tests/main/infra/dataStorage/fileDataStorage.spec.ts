/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 'node:original-fs' is an Electron-only built-in; alias it to the standard fs
// module so fileDataStorage (which imports it) can be loaded under Jest.
jest.mock('node:original-fs', () => jest.requireActual('node:fs'), { virtual: true });

import { copyFileDataStorage, createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';

let dirPath: string;

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), 'freeter-fds-'));
})

afterEach(async () => {
  await rm(dirPath, { recursive: true, force: true });
})

describe('FileDataStorage', () => {
  it('should round-trip a value set and read back under the same key', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await storage.setText('plain-key', 'hello');

    expect(await storage.getText('plain-key')).toBe('hello');
  })

  it('should round-trip a value under a key containing characters that get sanitized in the file path', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    const key = 'a:b/c*d';

    await storage.setText(key, 'sanitized-key-data');

    // Regression: setText used to write to the raw key path while getText read
    // from the sanitized path, so the value would be invisible on read-back.
    expect(await storage.getText(key)).toBe('sanitized-key-data');
  })

  it('should expose the sanitized file name through getKeys after setText', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await storage.setText('a:b', 'x');

    expect(await storage.getKeys()).toEqual(['a_b']);
  })

  it('should replace an existing file without leaving the temp file behind', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await storage.setText('state', 'old');
    await storage.setText('state', 'new');

    expect(await storage.getText('state')).toBe('new');
    expect(await readdir(dirPath)).toEqual(['state']);
  })

  it('should not list a leftover temp file (crash between write and rename) as a key', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    await storage.setText('state', 'x');
    await writeFile(join(dirPath, 'state.tmp'), 'partial');

    expect(await storage.getKeys()).toEqual(['state']);
  })

  it('should delete an existing item', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    await storage.setText('to-delete', 'x');

    await storage.deleteItem('to-delete');

    expect(await storage.getText('to-delete')).toBeUndefined();
    expect(await storage.getKeys()).toEqual([]);
  })

  it('should resolve without throwing when deleting a non-existent item', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await expect(storage.deleteItem('never-existed')).resolves.toBeUndefined();
  })

  it('should skip temp files when copying a storage folder', async () => {
    // A write in flight renames its temp file away after cp lists it; copying
    // temp files would then fail the whole copy with ENOENT.
    const fromDir = join(dirPath, 'from');
    const toDir = join(dirPath, 'to');
    const storage = await createFileDataStorage('string', fromDir);
    await storage.setText('note', 'x');
    await writeFile(join(fromDir, 'note.tmp'), 'in flight');

    expect(await copyFileDataStorage(fromDir, toDir)).toBe(true);

    expect(await readdir(toDir)).toEqual(['note']);
  })

  it('should leave temp files alone when clearing', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    await storage.setText('note', 'x');
    await writeFile(join(dirPath, 'note.tmp'), 'in flight');

    await storage.clear();

    expect(await readdir(dirPath)).toEqual(['note.tmp']);
  })
})
