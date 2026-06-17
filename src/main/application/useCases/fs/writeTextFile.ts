/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { FsProvider } from '@/application/interfaces/fsProvider';

interface Deps {
  fsProvider: FsProvider;
}

export function createWriteTextFileUseCase({ fsProvider }: Deps) {
  return async function writeTextFileUseCase(path: string, text: string): Promise<boolean> {
    return fsProvider.writeTextFile(path, text);
  }
}

export type WriteTextFileUseCase = ReturnType<typeof createWriteTextFileUseCase>;
