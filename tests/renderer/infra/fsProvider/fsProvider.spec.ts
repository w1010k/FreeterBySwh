/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcFsSearchChannel, ipcFsReadDirChannel, ipcFsGetHomeDirChannel } from '@common/ipc/channels';
import { createFsProvider } from '@/infra/fsProvider/fsProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

jest.mock('@/infra/mainApi/mainApi');

describe('FsProvider', () => {
  beforeEach(() => jest.resetAllMocks())

  describe('search', () => {
    it('should send the roots, query and options to the main process via a right ipc channel', async () => {
      const fsProvider = createFsProvider();

      await fsProvider.search(['/a'], 'q', { includeHidden: false });

      expect(electronIpcRenderer.invoke).toHaveBeenCalledWith(ipcFsSearchChannel, ['/a'], 'q', { includeHidden: false });
    })
  })

  describe('readDir', () => {
    it('should send a message to the main process via a right ipc channel with right args', async () => {
      const testPath = '/some/dir';
      const fsProvider = createFsProvider();

      await fsProvider.readDir(testPath);

      expect(electronIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      expect(electronIpcRenderer.invoke).toHaveBeenCalledWith(ipcFsReadDirChannel, testPath, undefined);
    })

    it('should forward read options to the main process', async () => {
      const testPath = '/some/dir';
      const opts = { includeHidden: false, includeSizes: false };
      const fsProvider = createFsProvider();

      await fsProvider.readDir(testPath, opts);

      expect(electronIpcRenderer.invoke).toHaveBeenCalledWith(ipcFsReadDirChannel, testPath, opts);
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
