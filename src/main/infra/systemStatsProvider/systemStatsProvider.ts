/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { statfsSync } from 'node:fs';
import { cpus, freemem, totalmem, uptime } from 'node:os';
import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';
import { SystemStats } from '@common/base/systemStats';

interface CpuTimes { idle: number; total: number }

/** The fields of Electron's `ProcessMetric` this provider reads. */
export interface AppProcessMetric {
  /** Electron already reports this as a share of the whole machine (all cores), not of one core. */
  cpu: { percentCPUUsage: number };
  /** Kilobytes. */
  memory: { workingSetSize: number };
}

function coreTimes(): CpuTimes[] {
  return cpus().map(({ times: t }) => ({ idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq }));
}

function usagePercent(cur: CpuTimes, prev: CpuTimes): number {
  const totalDiff = cur.total - prev.total;
  return totalDiff > 0
    ? Math.max(0, Math.min(100, 100 * (1 - (cur.idle - prev.idle) / totalDiff)))
    : 0;
}

function sumTimes(times: CpuTimes[]): CpuTimes {
  return times.reduce((acc, t) => ({ idle: acc.idle + t.idle, total: acc.total + t.total }), { idle: 0, total: 0 });
}

// ponytail: system drive only. Probing every drive letter could block on a disconnected network drive.
function systemDriveRoot(): string {
  return process.platform === 'win32' ? `${process.env.SystemDrive ?? 'C:'}\\` : '/';
}

function readDisk(): SystemStats['disk'] {
  try {
    const { blocks, bfree, bsize } = statfsSync(systemDriveRoot());
    return { usedBytes: (blocks - bfree) * bsize, totalBytes: blocks * bsize };
  } catch {
    return null;
  }
}

// Calls closer together than this share the last result. Several System Monitor
// widgets poll the one provider within a few ms of each other; a near-zero sample
// window would make the later widget read 0% or 100%.
const minSampleIntervalMs = 500;

/**
 * System stats. CPU% (overall and per core) is derived from the change in cpu times
 * since the previous call (the standard way to get instantaneous usage from
 * os.cpus()), so it reflects the interval between successive polls. Electron's
 * per-process CPU% also covers the time since its previous call. The provider
 * is one instance shared by every caller, hence the short reuse window above.
 */
export function createSystemStatsProvider(
  getAppMetrics: () => AppProcessMetric[],
  now: () => number = Date.now
): SystemStatsProvider {
  let prev = coreTimes();
  let last: { at: number; stats: SystemStats } | null = null;
  return {
    getStats(): SystemStats {
      const nowMs = now();
      if (last && nowMs - last.at < minSampleIntervalMs) {
        return last.stats;
      }
      const cur = coreTimes();
      // A core missing from the previous sample (core count changed) compares against itself and reads 0%.
      const cpuCorePercents = cur.map((c, i) => usagePercent(c, prev[i] ?? c));
      const cpuPercent = usagePercent(sumTimes(cur), sumTimes(prev));
      prev = cur;
      const memTotalBytes = totalmem();
      const memUsedBytes = memTotalBytes - freemem();
      let appCpuPercent = 0;
      let appMemBytes = 0;
      for (const m of getAppMetrics()) {
        appCpuPercent += m.cpu.percentCPUUsage;
        appMemBytes += m.memory.workingSetSize * 1024;
      }
      last = {
        at: nowMs,
        stats: {
          cpuPercent,
          cpuCorePercents,
          memUsedBytes,
          memTotalBytes,
          appCpuPercent: Math.min(100, appCpuPercent),
          appMemBytes,
          disk: readDisk(),
          uptimeSec: uptime(),
        }
      };
      return last.stats;
    }
  };
}
