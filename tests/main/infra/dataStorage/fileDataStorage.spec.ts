/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 'node:original-fs' is an Electron-only built-in; alias it to the standard fs
// module so fileDataStorage (which imports it) can be loaded under Jest.
jest.mock('node:original-fs', () => jest.requireActual('node:fs'), { virtual: true });

import { createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';

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
})
