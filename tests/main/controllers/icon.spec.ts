/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcGetFaviconChannel, ipcGetFileIconChannel } from '@common/ipc/channels';
import { createIconControllers } from '@/controllers/icon';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

const getFileIconRes = 'data:image/png;base64,AAA';
const getFaviconRes = 'data:image/png;base64,BBB';

function setup() {
  const getFileIconUseCase = jest.fn(async () => getFileIconRes as string | null);
  const getFaviconUseCase = jest.fn(async () => getFaviconRes as string | null);

  const [getFileIconController, getFaviconController] = createIconControllers({
    getFileIconUseCase,
    getFaviconUseCase,
  });

  return {
    getFileIconUseCase,
    getFaviconUseCase,
    getFileIconController,
    getFaviconController,
  };
}

describe('IconControllers', () => {
  describe('getFileIconController', () => {
    it('has the expected channel name', () => {
      const { channel } = setup().getFileIconController;
      expect(channel).toBe(ipcGetFileIconChannel);
    });

    it('delegates to getFileIconUseCase and returns its result', async () => {
      const { getFileIconController, getFileIconUseCase } = setup();
      const event = fixtureIpcMainEvent();

      const res = await getFileIconController.handle(event, '/some/path');

      expect(getFileIconUseCase).toBeCalledTimes(1);
      expect(getFileIconUseCase).toBeCalledWith('/some/path', undefined);
      expect(res).toBe(getFileIconRes);
    });

    it('forwards bypassCache flag', async () => {
      const { getFileIconController, getFileIconUseCase } = setup();
      const event = fixtureIpcMainEvent();

      await getFileIconController.handle(event, '/some/path', true);

      expect(getFileIconUseCase).toBeCalledWith('/some/path', true);
    });
  });

  describe('getFaviconController', () => {
    it('has the expected channel name', () => {
      const { channel } = setup().getFaviconController;
      expect(channel).toBe(ipcGetFaviconChannel);
    });

    it('delegates to getFaviconUseCase and returns its result', async () => {
      const { getFaviconController, getFaviconUseCase } = setup();
      const event = fixtureIpcMainEvent();

      const res = await getFaviconController.handle(event, 'https://example.com');

      expect(getFaviconUseCase).toBeCalledTimes(1);
      expect(getFaviconUseCase).toBeCalledWith('https://example.com', undefined);
      expect(res).toBe(getFaviconRes);
    });

    it('forwards bypassCache flag', async () => {
      const { getFaviconController, getFaviconUseCase } = setup();
      const event = fixtureIpcMainEvent();

      await getFaviconController.handle(event, 'https://example.com', true);

      expect(getFaviconUseCase).toBeCalledWith('https://example.com', true);
    });
  });
});
