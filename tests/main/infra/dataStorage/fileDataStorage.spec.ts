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
jest.mock('@/infra/utils/atomicFile', () => {
  const actual = jest.requireActual<typeof import('@/infra/utils/atomicFile')>('@/infra/utils/atomicFile');
  return { ...actual, writeFileAtomic: jest.fn(actual.writeFileAtomic) };
});

import { copyFileDataStorage, createFileDataStorage } from '@/infra/dataStorage/fileDataStorage';
import { writeFileAtomic } from '@/infra/utils/atomicFile';

let dirPath: string;

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), 'freeter-fds-'));
})

afterEach(async () => {
  jest.restoreAllMocks();
  await rm(dirPath, { recursive: true, force: true });
})

describe('FileDataStorage', () => {
  it.each(['getText', 'getKeys', 'clear'] as const)('should reject permission failures in %s instead of reporting empty storage', async method => {
    const storage = await createFileDataStorage('string', dirPath);
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const error = Object.assign(new Error('denied'), { code: 'EACCES' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    if (method === 'getText') {
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(error);
      await expect(storage.getText('state')).rejects.toBe(error);
    } else {
      jest.spyOn(fs, 'readdir').mockRejectedValueOnce(error);
      await expect(storage[method]()).rejects.toBe(error);
    }
  });

  it('should still treat a missing storage directory as empty', async () => {
    const missing = join(dirPath, 'missing');
    const storage = await createFileDataStorage('string', missing);
    await rm(missing, { recursive: true });

    expect(await storage.getText('state')).toBeUndefined();
    expect(await storage.getKeys()).toEqual([]);
    await expect(storage.clear()).resolves.toBeUndefined();
  });

  it('should finish all deletions before releasing a failed clear barrier', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    await storage.setText('a', 'old');
    await storage.setText('b', 'old');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const unlink = fs.unlink;
    const error = Object.assign(new Error('denied'), { code: 'EACCES' });
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const start = new Promise<void>(resolve => { started = resolve; });
    jest.spyOn(fs, 'unlink').mockImplementation(async path => {
      if (path === join(dirPath, 'a')) {
        throw error;
      }
      started();
      await gate;
      await unlink(path);
    });
    const clearing = storage.clear().catch(err => err);
    await start;
    jest.mocked(writeFileAtomic).mockClear();
    const later = storage.setText('b', 'new');
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(writeFileAtomic).not.toHaveBeenCalled();
    } finally {
      release();
      await Promise.all([clearing, later]);
    }

    expect(await clearing).toBe(error);
    expect(await storage.getText('b')).toBe('new');
  });

  it('should reject a failed save and permit the same value to be retried', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    const error = new Error('save failed');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.mocked(writeFileAtomic).mockRejectedValueOnce(error);

    await expect(storage.setText('state', 'new')).rejects.toBe(error);
    await storage.setText('state', 'new');

    expect(await storage.getText('state')).toBe('new');
  });

  it('should share ordering across two instances of the same folder', async () => {
    const first = await createFileDataStorage('string', dirPath);
    const second = await createFileDataStorage('string', join(dirPath, 'child', '..'));
    const actual = jest.requireActual<typeof import('@/infra/utils/atomicFile')>('@/infra/utils/atomicFile');
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const start = new Promise<void>(resolve => { started = resolve; });
    jest.mocked(writeFileAtomic).mockClear().mockImplementationOnce(async (...args) => {
      started();
      await gate;
      await actual.writeFileAtomic(...args);
    });
    const earlier = first.setText('state', 'earlier');
    await start;
    const later = second.setText('state', 'later');
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(writeFileAtomic).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await Promise.all([earlier, later]);
    }

    expect(await first.getText('state')).toBe('later');
  });

  it('should copy after preceding source and destination writes, before later changes', async () => {
    const fromDir = join(dirPath, 'from');
    const toDir = join(dirPath, 'to');
    const from = await createFileDataStorage('string', fromDir);
    const to = await createFileDataStorage('string', toDir);
    const actual = jest.requireActual<typeof import('@/infra/utils/atomicFile')>('@/infra/utils/atomicFile');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const copySpy = jest.spyOn(fs, 'cp');
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const start = new Promise<void>(resolve => { started = resolve; });
    jest.mocked(writeFileAtomic).mockImplementationOnce(async (...args) => {
      started();
      await gate;
      await actual.writeFileAtomic(...args);
    });
    const earlierSource = from.setText('note', 'before copy');
    await start;
    const earlierDestination = to.setText('keep', 'destination');
    const copying = copyFileDataStorage(fromDir, toDir);
    const laterSource = from.setText('note', 'after copy');
    const laterDestination = to.setText('new', 'later');
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(copySpy).not.toHaveBeenCalled();
    } finally {
      release();
      await Promise.all([earlierSource, earlierDestination, copying, laterSource, laterDestination]);
    }

    expect(await copying).toBe(true);
    expect(await from.getText('note')).toBe('after copy');
    expect(await to.getText('note')).toBe('before copy');
    expect(await to.getText('keep')).toBe('destination');
    expect(await to.getText('new')).toBe('later');
  });

  it('should order copies with clears and opposite-direction copies without deadlocks', async () => {
    const fromDir = join(dirPath, 'from');
    const toDir = join(dirPath, 'to');
    const from = await createFileDataStorage('string', fromDir);
    const to = await createFileDataStorage('string', toDir);
    await from.setText('note', 'source');
    await to.setText('obsolete', 'destination');

    const results = await Promise.all([
      to.clear(),
      copyFileDataStorage(fromDir, toDir),
      from.clear(),
      copyFileDataStorage(toDir, fromDir),
      to.setText('later', 'new'),
    ]);

    expect(results[1]).toBe(true);
    expect(results[3]).toBe(true);
    expect(await from.getKeys()).toEqual(['note']);
    expect(await from.getText('note')).toBe('source');
    expect((await to.getKeys()).sort()).toEqual(['later', 'note']);
  });

  it('should clear earlier writes before allowing later writes to run', async () => {
    const storage = await createFileDataStorage('string', dirPath);
    const actual = jest.requireActual<typeof import('@/infra/utils/atomicFile')>('@/infra/utils/atomicFile');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const readdirSpy = jest.spyOn(fs, 'readdir');
    let releaseWrite!: () => void;
    let writeStarted!: () => void;
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    const started = new Promise<void>(resolve => { writeStarted = resolve; });
    jest.mocked(writeFileAtomic).mockImplementationOnce(async (...args) => {
      writeStarted();
      await gate;
      await actual.writeFileAtomic(...args);
    });

    const beforeClear = storage.setText('earlier', 'old');
    await started;
    const clearing = storage.clear();
    const afterClear = storage.setText('later', 'new');
    try {
      // Let queued microtasks run while the earlier real filesystem write is gated.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(readdirSpy).not.toHaveBeenCalled();
    } finally {
      releaseWrite();
      await Promise.all([beforeClear, clearing, afterClear]);
      readdirSpy.mockRestore();
    }

    expect(await storage.getText('earlier')).toBeUndefined();
    expect(await storage.getText('later')).toBe('new');
    expect(await storage.getKeys()).toEqual(['later']);
  });

  it('should round-trip a value set and read back under the same key', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await storage.setText('plain-key', 'hello');

    expect(await storage.getText('plain-key')).toBe('hello');
  })

  it('should preserve call order through consecutive clears', async () => {
    const storage = await createFileDataStorage('string', dirPath);

    await Promise.all([
      storage.setText('first', 'old'),
      storage.clear(),
      storage.setText('second', 'also old'),
      storage.clear(),
      storage.setText('third', 'new'),
    ]);

    expect(await storage.getKeys()).toEqual(['third']);
    expect(await storage.getText('third')).toBe('new');
  });

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
