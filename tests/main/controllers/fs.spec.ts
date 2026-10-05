/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcFsReadDirChannel, ipcFsGetHomeDirChannel, ipcFsReadTextFileChannel, ipcFsWriteTextFileChannel, ipcFsGetMtimeChannel } from '@common/ipc/channels';
import { createFsControllers } from '@/controllers/fs';
import { FsDirEntry } from '@common/base/fs';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

const readDirUseCaseRes: FsDirEntry[] = [{ name: 'a', path: '/d/a', isDirectory: true, size: 0 }];
const getHomeDirUseCaseRes = '/home/user';
const readTextFileUseCaseRes = { text: '# hi', mtimeMs: 1 };

function setup() {
  const readDirUseCase = jest.fn(async () => readDirUseCaseRes);
  const getHomeDirUseCase = jest.fn(() => getHomeDirUseCaseRes);
  const getImageDataUrlUseCase = jest.fn(async () => null);
  const readTextFileUseCase = jest.fn(async () => readTextFileUseCaseRes);
  const writeTextFileUseCase = jest.fn(async () => 42);
  const getMtimeUseCase = jest.fn(async () => 7);

  const [
    readDirController,
    getHomeDirController,
    getImageDataUrlController,
    readTextFileController,
    writeTextFileController,
    getMtimeController,
  ] = createFsControllers({
    readDirUseCase,
    getHomeDirUseCase,
    getImageDataUrlUseCase,
    readTextFileUseCase,
    writeTextFileUseCase,
    getMtimeUseCase,
  })

  return {
    readDirUseCase,
    getHomeDirUseCase,
    getImageDataUrlUseCase,
    readTextFileUseCase,
    writeTextFileUseCase,
    getMtimeUseCase,
    readDirController,
    getHomeDirController,
    getImageDataUrlController,
    readTextFileController,
    writeTextFileController,
    getMtimeController,
  }
}

describe('FsControllers', () => {
  describe('readDirController', () => {
    it('should have a right channel name', () => {
      const { channel } = setup().readDirController;

      expect(channel).toBe(ipcFsReadDirChannel)
    })

    it('should call a right usecase with right params and return its result', async () => {
      const testPath = '/some/dir';

      const { readDirController, readDirUseCase } = setup();
      const { handle } = readDirController;
      const event = fixtureIpcMainEvent();

      const res = await handle(event, testPath);

      expect(readDirUseCase).toHaveBeenCalledTimes(1);
      expect(readDirUseCase).toHaveBeenCalledWith(testPath, undefined);
      expect(res).toBe(readDirUseCaseRes);
    });

    it('should forward read options to the usecase', async () => {
      const testPath = '/some/dir';
      const opts = { includeHidden: false, includeSizes: false };

      const { readDirController, readDirUseCase } = setup();
      const { handle } = readDirController;
      const event = fixtureIpcMainEvent();

      await handle(event, testPath, opts);

      expect(readDirUseCase).toHaveBeenCalledWith(testPath, opts);
    });
  })

  describe('getHomeDirController', () => {
    it('should have a right channel name', () => {
      const { channel } = setup().getHomeDirController;

      expect(channel).toBe(ipcFsGetHomeDirChannel)
    })

    it('should call a right usecase and return its result', async () => {
      const { getHomeDirController, getHomeDirUseCase } = setup();
      const { handle } = getHomeDirController;
      const event = fixtureIpcMainEvent();

      const res = await handle(event);

      expect(getHomeDirUseCase).toHaveBeenCalledTimes(1);
      expect(res).toBe(getHomeDirUseCaseRes);
    });
  })

  describe('text file controllers', () => {
    it('should have right channel names', () => {
      const { readTextFileController, writeTextFileController, getMtimeController } = setup();

      expect(readTextFileController.channel).toBe(ipcFsReadTextFileChannel);
      expect(writeTextFileController.channel).toBe(ipcFsWriteTextFileChannel);
      expect(getMtimeController.channel).toBe(ipcFsGetMtimeChannel);
    })

    it('should forward args to the right usecases and return their results', async () => {
      const { readTextFileController, writeTextFileController, getMtimeController, readTextFileUseCase, writeTextFileUseCase, getMtimeUseCase } = setup();
      const event = fixtureIpcMainEvent();

      expect(await readTextFileController.handle(event, '/d/a.md')).toBe(readTextFileUseCaseRes);
      expect(readTextFileUseCase).toHaveBeenCalledWith('/d/a.md');
      expect(await writeTextFileController.handle(event, '/d/a.md', 'text')).toBe(42);
      expect(writeTextFileUseCase).toHaveBeenCalledWith('/d/a.md', 'text');
      expect(await getMtimeController.handle(event, '/d/a.md')).toBe(7);
      expect(getMtimeUseCase).toHaveBeenCalledWith('/d/a.md');
    })
  })
})
