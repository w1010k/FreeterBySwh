/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createGetFileIconUseCase } from '@/application/useCases/icon/getFileIcon';
import { mockIconProvider } from '@tests/infra/mocks/iconProvider';

function setup(props: Partial<ReturnType<typeof mockIconProvider>> = {}) {
  const iconProviderMock = mockIconProvider({
    getFileIcon: jest.fn(async () => 'data:image/png;base64,AAAA'),
    ...props,
  });
  const useCase = createGetFileIconUseCase({ iconProvider: iconProviderMock });
  return { iconProviderMock, useCase };
}

describe('getFileIconUseCase()', () => {
  it('returns the data URI from iconProvider for a valid path', async () => {
    const { useCase, iconProviderMock } = setup();

    const res = await useCase('/some/file');

    expect(iconProviderMock.getFileIcon).toBeCalledTimes(1);
    expect(iconProviderMock.getFileIcon).toBeCalledWith('/some/file', undefined);
    expect(res).toBe('data:image/png;base64,AAAA');
  });

  it('forwards bypassCache=true to iconProvider', async () => {
    const { useCase, iconProviderMock } = setup();

    await useCase('/some/file', true);

    expect(iconProviderMock.getFileIcon).toBeCalledWith('/some/file', true);
  });

  it('returns null without calling provider for empty path', async () => {
    const { useCase, iconProviderMock } = setup();

    const res = await useCase('');

    expect(iconProviderMock.getFileIcon).not.toBeCalled();
    expect(res).toBeNull();
  });

  it('returns null when provider throws', async () => {
    const { useCase } = setup({
      getFileIcon: jest.fn(async () => { throw new Error('boom'); })
    });

    const res = await useCase('/some/file');

    expect(res).toBeNull();
  });

  it('returns null when provider returns null', async () => {
    const { useCase } = setup({ getFileIcon: jest.fn(async () => null) });

    const res = await useCase('/missing');

    expect(res).toBeNull();
  });
});
