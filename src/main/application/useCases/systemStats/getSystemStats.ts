/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';
import { SystemStats } from '@common/base/systemStats';

interface Deps {
  systemStatsProvider: SystemStatsProvider;
}

export function createGetSystemStatsUseCase({ systemStatsProvider }: Deps) {
  return function getSystemStatsUseCase(): SystemStats {
    return systemStatsProvider.getStats();
  };
}

export type GetSystemStatsUseCase = ReturnType<typeof createGetSystemStatsUseCase>;
