/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcGetFaviconChannel, ipcGetFileIconChannel } from '@common/ipc/channels';
import { createIconProvider } from '@/infra/iconProvider/iconProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

jest.mock('@/infra/mainApi/mainApi');

describe('IconProvider', () => {
  beforeEach(() => jest.resetAllMocks())

  describe('getFileIcon', () => {
    it('should send a message to the main process via the right ipc channel with the path', () => {
      const testPath = '/some/file';
      const iconProvider = createIconProvider();

      iconProvider.getFileIcon(testPath);

      expect(electronIpcRenderer.invoke).toBeCalledTimes(1);
      expect(electronIpcRenderer.invoke).toBeCalledWith(ipcGetFileIconChannel, testPath, undefined);
    })

    it('forwards the bypassCache flag', () => {
      const iconProvider = createIconProvider();

      iconProvider.getFileIcon('/some/file', true);

      expect(electronIpcRenderer.invoke).toBeCalledWith(ipcGetFileIconChannel, '/some/file', true);
    })
  })

  describe('getFavicon', () => {
    it('should send a message to the main process via the right ipc channel with the url', () => {
      const testUrl = 'https://example.com';
      const iconProvider = createIconProvider();

      iconProvider.getFavicon(testUrl);

      expect(electronIpcRenderer.invoke).toBeCalledTimes(1);
      expect(electronIpcRenderer.invoke).toBeCalledWith(ipcGetFaviconChannel, testUrl, undefined);
    })

    it('forwards the bypassCache flag', () => {
      const iconProvider = createIconProvider();

      iconProvider.getFavicon('https://example.com', true);

      expect(electronIpcRenderer.invoke).toBeCalledWith(ipcGetFaviconChannel, 'https://example.com', true);
    })
  })
});
