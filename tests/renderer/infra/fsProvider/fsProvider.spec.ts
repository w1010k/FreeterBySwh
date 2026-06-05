/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcFsReadDirChannel, ipcFsGetHomeDirChannel } from '@common/ipc/channels';
import { createFsProvider } from '@/infra/fsProvider/fsProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

jest.mock('@/infra/mainApi/mainApi');

describe('FsProvider', () => {
  beforeEach(() => jest.resetAllMocks())

  describe('readDir', () => {
    it('should send a message to the main process via a right ipc channel with right args', async () => {
      const testPath = '/some/dir';
      const fsProvider = createFsProvider();

      await fsProvider.readDir(testPath);

      expect(electronIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      expect(electronIpcRenderer.invoke).toHaveBeenCalledWith(ipcFsReadDirChannel, testPath);
    })
  })

  describe('getHomeDir', () => {
    it('should send a message to the main process via a right ipc channel', async () => {
      const fsProvider = createFsProvider();

      await fsProvider.getHomeDir();

      expect(electronIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      expect(electronIpcRenderer.invoke).toHaveBeenCalledWith(ipcFsGetHomeDirChannel);
    })
  })
});
