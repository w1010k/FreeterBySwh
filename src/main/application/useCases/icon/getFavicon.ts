/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IconProvider } from '@/application/interfaces/iconProvider';
import { sanitizeUrl } from '@common/helpers/sanitizeUrl';

interface Deps {
  iconProvider: IconProvider;
}

export function createGetFaviconUseCase({ iconProvider }: Deps) {
  return async function getFaviconUseCase(url: string, bypassCache?: boolean): Promise<string | null> {
    if (typeof url !== 'string' || url === '') {
      return null;
    }
    const sanitized = sanitizeUrl(url);
    if (!sanitized) {
      return null;
    }
    try {
      return await iconProvider.getFavicon(sanitized, bypassCache);
    } catch {
      return null;
    }
  }
}

export type GetFaviconUseCase = ReturnType<typeof createGetFaviconUseCase>;
