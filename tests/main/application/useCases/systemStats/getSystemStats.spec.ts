/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createGetSystemStatsUseCase } from '@/application/useCases/systemStats/getSystemStats';
import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';

describe('getSystemStatsUseCase', () => {
  it('returns the stats from the provider', () => {
    const stats = { cpuPercent: 10, memUsedBytes: 100, memTotalBytes: 200 };
    const systemStatsProvider: jest.MockedObject<SystemStatsProvider> = {
      getStats: jest.fn().mockReturnValue(stats)
    };
    const useCase = createGetSystemStatsUseCase({ systemStatsProvider });

    expect(useCase()).toBe(stats);
    expect(systemStatsProvider.getStats).toHaveBeenCalledTimes(1);
  });
});
