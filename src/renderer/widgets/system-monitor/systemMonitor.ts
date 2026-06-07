/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

const units = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable byte size, e.g. 5368709120 → "5.0 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const decimals = i >= 3 ? 1 : 0; // 1 decimal for GB/TB, whole numbers below
  return `${v.toFixed(decimals)} ${units[i]}`;
}

/** Clamp a value to an integer percentage 0–100. */
export function toPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
