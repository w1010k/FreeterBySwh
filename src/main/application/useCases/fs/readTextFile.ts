/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';

type Deps = {
  fsProvider: FsProvider;
}

export function createReadTextFileUseCase({ fsProvider }: Deps) {
  return (path: string) => fsProvider.readTextFile(path);
}

export type ReadTextFileUseCase = ReturnType<typeof createReadTextFileUseCase>;
