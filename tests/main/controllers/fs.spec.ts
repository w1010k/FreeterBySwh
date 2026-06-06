/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcFsReadDirChannel, ipcFsGetHomeDirChannel } from '@common/ipc/channels';
import { createFsControllers } from '@/controllers/fs';
import { FsDirEntry } from '@common/base/fs';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

const readDirUseCaseRes: FsDirEntry[] = [{ name: 'a', path: '/d/a', isDirectory: true, size: 0 }];
const getHomeDirUseCaseRes = '/home/user';

function setup() {
  const readDirUseCase = jest.fn(async () => readDirUseCaseRes);
  const getHomeDirUseCase = jest.fn(() => getHomeDirUseCaseRes);
  const getImageDataUrlUseCase = jest.fn(async () => null);

  const [
    readDirController,
    getHomeDirController,
    getImageDataUrlController
  ] = createFsControllers({
    readDirUseCase,
    getHomeDirUseCase,
    getImageDataUrlUseCase
  })

  return {
    readDirUseCase,
    getHomeDirUseCase,
    getImageDataUrlUseCase,
    readDirController,
    getHomeDirController,
    getImageDataUrlController,
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
})
