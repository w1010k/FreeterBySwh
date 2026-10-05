/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { cpus, freemem, totalmem } from 'node:os';
import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';
import { SystemStats } from '@common/base/systemStats';

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

// Calls closer together than this share the last result. Several System Monitor
// widgets poll the one provider within a few ms of each other; a near-zero sample
// window would make the later widget read 0% or 100%.
const minSampleIntervalMs = 500;

/**
 * System CPU/RAM stats. CPU% is derived from the change in aggregate cpu times
 * since the previous call (the standard way to get instantaneous usage from
 * os.cpus()), so it reflects the interval between successive polls. The provider
 * is one instance shared by every caller, hence the short reuse window above.
 */
export function createSystemStatsProvider(now: () => number = Date.now): SystemStatsProvider {
  let prev = cpuTimes();
  let last: { at: number; stats: SystemStats } | null = null;
  return {
    getStats(): SystemStats {
      const nowMs = now();
      if (last && nowMs - last.at < minSampleIntervalMs) {
        return last.stats;
      }
      const cur = cpuTimes();
      const idleDiff = cur.idle - prev.idle;
      const totalDiff = cur.total - prev.total;
      prev = cur;
      const cpuPercent = totalDiff > 0
        ? Math.max(0, Math.min(100, 100 * (1 - idleDiff / totalDiff)))
        : 0;
      const memTotalBytes = totalmem();
      const memUsedBytes = memTotalBytes - freemem();
      last = { at: nowMs, stats: { cpuPercent, memUsedBytes, memTotalBytes } };
      return last.stats;
    }
  };
}
