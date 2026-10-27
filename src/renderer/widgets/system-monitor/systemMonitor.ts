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

/** Compact duration, e.g. 274320 → "3d 4h 12m". Larger units are omitted while zero. */
export function formatUptime(sec: number): string {
  const totalMin = Number.isFinite(sec) && sec > 0 ? Math.floor(sec / 60) : 0;
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  if (d > 0) {
    return `${d}d ${h}h ${m}m`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Clamp a value to an integer percentage 0–100. */
export function toPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
