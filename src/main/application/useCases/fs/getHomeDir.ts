/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';

interface Deps {
  fsProvider: FsProvider;
}

export function createGetHomeDirUseCase({ fsProvider }: Deps) {
  return function getHomeDirUseCase(): string {
    return fsProvider.getHomeDir();
  }
}

export type GetHomeDirUseCase = ReturnType<typeof createGetHomeDirUseCase>;
