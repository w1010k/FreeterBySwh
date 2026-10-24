/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileAtomic } from '@/infra/utils/atomicFile';

let dirPath: string;

beforeEach(async () => {
  dirPath = await mkdtemp(join(tmpdir(), 'freeter-atomic-'));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await rm(dirPath, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('should reject a non-transient rename failure without overwriting the original', async () => {
    const path = join(dirPath, 'state');
    await writeFile(path, 'original');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const error = Object.assign(new Error('full disk'), { code: 'ENOSPC' });
    const rename = jest.spyOn(fs, 'rename').mockRejectedValue(error);

    await expect(writeFileAtomic(path, 'replacement')).rejects.toBe(error);

    expect(rename).toHaveBeenCalledTimes(1);
    expect(await readFile(path, 'utf8')).toBe('original');
  });

  it('should retry a temporary sharing violation and replace the original atomically', async () => {
    const path = join(dirPath, 'state');
    await writeFile(path, 'original');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const error = Object.assign(new Error('busy'), { code: 'EBUSY' });
    const rename = jest.spyOn(fs, 'rename').mockRejectedValueOnce(error).mockRejectedValueOnce(error);

    await writeFileAtomic(path, 'replacement');

    expect(rename).toHaveBeenCalledTimes(3);
    expect(await readFile(path, 'utf8')).toBe('replacement');
    await expect(readFile(path + '.tmp')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('should stop retrying a persistent permission failure and keep the original', async () => {
    const path = join(dirPath, 'state');
    await writeFile(path, 'original');
    const fs = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
    const error = Object.assign(new Error('denied'), { code: 'EACCES' });
    const rename = jest.spyOn(fs, 'rename').mockRejectedValue(error);

    await expect(writeFileAtomic(path, 'replacement')).rejects.toBe(error);

    expect(rename).toHaveBeenCalledTimes(4);
    expect(await readFile(path, 'utf8')).toBe('original');
  });
});
