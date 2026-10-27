/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface SystemStats {
  /** Overall CPU usage 0–100 (%), measured since the previous sample. */
  cpuPercent: number;
  /** Per-core CPU usage 0-100 (%), same window as `cpuPercent`. */
  cpuCorePercents: number[];
  memUsedBytes: number;
  memTotalBytes: number;
  /** CPU used by all Freeter processes, as a share 0-100 (%) of the whole machine. */
  appCpuPercent: number;
  /** Working set of all Freeter processes. */
  appMemBytes: number;
  /** System drive usage; null when it could not be read. */
  disk: { usedBytes: number; totalBytes: number } | null;
  uptimeSec: number;
}
