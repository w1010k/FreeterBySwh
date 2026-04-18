/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createGetFaviconUseCase } from '@/application/useCases/icon/getFavicon';
import { mockIconProvider } from '@tests/infra/mocks/iconProvider';

function setup(props: Partial<ReturnType<typeof mockIconProvider>> = {}) {
  const iconProviderMock = mockIconProvider({
    getFavicon: jest.fn(async () => 'data:image/png;base64,AAAA'),
    ...props,
  });
  const useCase = createGetFaviconUseCase({ iconProvider: iconProviderMock });
  return { iconProviderMock, useCase };
}

describe('getFaviconUseCase()', () => {
  it('sanitizes the url and returns the data URI from iconProvider', async () => {
    const { useCase, iconProviderMock } = setup();

    const res = await useCase('freeter.io');

    expect(iconProviderMock.getFavicon).toBeCalledTimes(1);
    expect(iconProviderMock.getFavicon).toBeCalledWith('https://freeter.io', undefined);
    expect(res).toBe('data:image/png;base64,AAAA');
  });

  it('passes already-qualified urls through as-is', async () => {
    const { useCase, iconProviderMock } = setup();

    await useCase('https://example.com/page');

    expect(iconProviderMock.getFavicon).toBeCalledWith('https://example.com/page', undefined);
  });

  it('forwards bypassCache=true to iconProvider', async () => {
    const { useCase, iconProviderMock } = setup();

    await useCase('freeter.io', true);

    expect(iconProviderMock.getFavicon).toBeCalledWith('https://freeter.io', true);
  });

  it('returns null for empty url without calling provider', async () => {
    const { useCase, iconProviderMock } = setup();

    const res = await useCase('');

    expect(iconProviderMock.getFavicon).not.toBeCalled();
    expect(res).toBeNull();
  });

  it('returns null for an unparseable url', async () => {
    const { useCase, iconProviderMock } = setup();

    const res = await useCase('test^url');

    expect(iconProviderMock.getFavicon).not.toBeCalled();
    expect(res).toBeNull();
  });

  it('returns null when provider throws', async () => {
    const { useCase } = setup({
      getFavicon: jest.fn(async () => { throw new Error('boom'); })
    });

    const res = await useCase('freeter.io');

    expect(res).toBeNull();
  });

  it('returns null when provider returns null', async () => {
    const { useCase } = setup({ getFavicon: jest.fn(async () => null) });

    const res = await useCase('freeter.io');

    expect(res).toBeNull();
  });
});
