/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { formatDDay, parseLocalDate } from '@/widgets/d-day/dDay';

describe('formatDDay', () => {
  const now = new Date(2026, 0, 1, 9, 0, 0); // 2026-01-01, mid-morning

  it('returns D-DAY on the target day (any time of day)', () => {
    expect(formatDDay('2026-01-01', now)).toEqual({ text: 'D-DAY', days: 0, isToday: true });
    expect(formatDDay('2026-01-01', new Date(2026, 0, 1, 23, 59))?.text).toBe('D-DAY');
  });

  it('returns D-N for a future date', () => {
    expect(formatDDay('2026-01-11', now)).toEqual({ text: 'D-10', days: 10, isToday: false });
    expect(formatDDay('2026-01-02', now)?.text).toBe('D-1');
  });

  it('returns D+N for a past date', () => {
    expect(formatDDay('2025-12-22', now)).toEqual({ text: 'D+10', days: -10, isToday: false });
    expect(formatDDay('2025-12-31', now)?.text).toBe('D+1');
  });

  it('returns null for an empty or invalid date', () => {
    expect(formatDDay('', now)).toBeNull();
    expect(formatDDay('not-a-date', now)).toBeNull();
    expect(formatDDay('2026-02-31', now)).toBeNull(); // rolled-over day
    expect(formatDDay('2026-13-01', now)).toBeNull(); // bad month
  });
});

describe('parseLocalDate', () => {
  it('parses a valid date to local midnight', () => {
    const d = parseLocalDate('2026-03-15');
    expect(d).not.toBeNull();
    expect([d!.getFullYear(), d!.getMonth(), d!.getDate()]).toEqual([2026, 2, 15]);
  });

  it('rejects malformed or rolled-over dates', () => {
    expect(parseLocalDate('2026-02-31')).toBeNull();
    expect(parseLocalDate('garbage')).toBeNull();
    expect(parseLocalDate('2026-1-1')).toBeNull(); // not zero-padded
  });
});
