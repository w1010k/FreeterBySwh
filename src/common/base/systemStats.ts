/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface SystemStats {
  /** Overall CPU usage 0–100 (%), measured since the previous sample. */
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
}
