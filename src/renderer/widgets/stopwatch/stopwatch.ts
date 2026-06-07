/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format elapsed milliseconds as a stopwatch string with centiseconds:
 * `mm:ss.cc`, or `h:mm:ss.cc` once it passes an hour. Negative input clamps to 0.
 */
export function formatStopwatch(ms: number): string {
  const totalCs = Math.floor(Math.max(0, ms) / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const base = h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  return `${base}.${pad2(cs)}`;
}
