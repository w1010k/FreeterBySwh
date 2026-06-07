/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { formatBytes, toPercent } from '@/widgets/system-monitor/systemMonitor';

describe('formatBytes', () => {
  it('formats sizes with sensible units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(16 * 1024 ** 3)).toBe('16.0 GB');
  });

  it('handles zero/negative/invalid input', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('toPercent', () => {
  it('rounds and clamps to 0–100', () => {
    expect(toPercent(42.4)).toBe(42);
    expect(toPercent(42.6)).toBe(43);
    expect(toPercent(-5)).toBe(0);
    expect(toPercent(150)).toBe(100);
    expect(toPercent(NaN)).toBe(0);
  });
});
