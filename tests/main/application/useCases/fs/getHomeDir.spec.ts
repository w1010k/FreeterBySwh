/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createGetHomeDirUseCase } from '@/application/useCases/fs/getHomeDir';
import { mockFsProvider } from '@tests/infra/mocks/fsProvider';

const providerRetVal = '/home/user';
function setup() {
  const fsProviderMock = mockFsProvider({
    getHomeDir: jest.fn(() => providerRetVal)
  })
  const useCase = createGetHomeDirUseCase({
    fsProvider: fsProviderMock
  });
  return {
    fsProviderMock,
    useCase
  }
}

describe('getHomeDirUseCase()', () => {
  it('should call getHomeDir() of fsProvider and return a right val', () => {
    const { useCase, fsProviderMock } = setup()

    const res = useCase();

    expect(fsProviderMock.getHomeDir).toHaveBeenCalledTimes(1);
    expect(res).toBe(providerRetVal);
  });
})
