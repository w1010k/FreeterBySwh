/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';
import { FsDirEntry } from '@common/base/fs';

interface Deps {
  fsProvider: FsProvider;
}

export function createReadDirUseCase({ fsProvider }: Deps) {
  return function readDirUseCase(dirPath: string): Promise<FsDirEntry[]> {
    return fsProvider.readDir(dirPath);
  }
}

export type ReadDirUseCase = ReturnType<typeof createReadDirUseCase>;
