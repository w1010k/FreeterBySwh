/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createReadDirUseCase } from '@/application/useCases/fs/readDir';
import { FsDirEntry } from '@common/base/fs';
import { mockFsProvider } from '@tests/infra/mocks/fsProvider';

const providerRetVal: FsDirEntry[] = [{ name: 'a.txt', path: '/dir/a.txt', isDirectory: false, size: 7 }];
function setup() {
  const fsProviderMock = mockFsProvider({
    readDir: jest.fn(async () => providerRetVal)
  })
  const useCase = createReadDirUseCase({
    fsProvider: fsProviderMock
  });
  return {
    fsProviderMock,
    useCase
  }
}

describe('readDirUseCase()', () => {
  it('should call readDir() of fsProvider with right params and return a right val', async () => {
    const testPath = '/some/dir'
    const { useCase, fsProviderMock } = setup()

    const res = await useCase(testPath);

    expect(fsProviderMock.readDir).toHaveBeenCalledTimes(1);
    expect(fsProviderMock.readDir).toHaveBeenCalledWith(testPath);
    expect(res).toBe(providerRetVal);
  });
})
