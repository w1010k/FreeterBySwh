/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IconProvider } from '@/application/interfaces/iconProvider';

interface Deps {
  iconProvider: IconProvider;
}

export function createGetFileIconUseCase({ iconProvider }: Deps) {
  return async function getFileIconUseCase(path: string, bypassCache?: boolean): Promise<string | null> {
    if (typeof path !== 'string' || path === '') {
      return null;
    }
    try {
      return await iconProvider.getFileIcon(path, bypassCache);
    } catch {
      return null;
    }
  }
}

export type GetFileIconUseCase = ReturnType<typeof createGetFileIconUseCase>;
