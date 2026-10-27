/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { statfsSync } from 'node:fs';
import { cpus } from 'node:os';
import { createSystemStatsProvider } from '@/infra/systemStatsProvider/systemStatsProvider';

jest.mock('node:fs', () => ({ ...jest.requireActual('node:fs'), statfsSync: jest.fn() }));
const statfsSyncMock = statfsSync as unknown as jest.Mock;

describe('SystemStatsProvider', () => {
  beforeEach(() => {
    statfsSyncMock.mockReset();
    statfsSyncMock.mockReturnValue({ blocks: 100, bfree: 25, bsize: 4096 });
  })

  it('returns the same sample to calls within 500ms, and a fresh one after', () => {
    let nowMs = 1000;
    const provider = createSystemStatsProvider(() => [], () => nowMs);
    const first = provider.getStats();
    nowMs += 499;
    expect(provider.getStats()).toBe(first);
    nowMs += 1;
    expect(provider.getStats()).not.toBe(first);
  })

  it('reports one CPU% per core', () => {
    const { cpuCorePercents } = createSystemStatsProvider(() => []).getStats();
    expect(cpuCorePercents).toHaveLength(cpus().length);
    for (const p of cpuCorePercents) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  })

  it('sums app process metrics, converting working set KB to bytes', () => {
    const stats = createSystemStatsProvider(() => [
      { cpu: { percentCPUUsage: 1.5 }, memory: { workingSetSize: 1000 } },
      { cpu: { percentCPUUsage: 2.5 }, memory: { workingSetSize: 24 } },
    ]).getStats();
    expect(stats.appCpuPercent).toBe(4);
    expect(stats.appMemBytes).toBe(1024 * 1024);
  })

  it('reports system drive usage from statfs, or null when statfs fails', () => {
    expect(createSystemStatsProvider(() => []).getStats().disk).toEqual({ usedBytes: 75 * 4096, totalBytes: 100 * 4096 });
    statfsSyncMock.mockImplementation(() => { throw new Error('EACCES'); });
    expect(createSystemStatsProvider(() => []).getStats().disk).toBeNull();
  })
})
