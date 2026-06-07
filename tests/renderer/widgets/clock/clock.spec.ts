/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { formatClock, isValidTimeZone } from '@/widgets/clock/clock';

describe('isValidTimeZone', () => {
  it('treats empty (local) as valid', () => expect(isValidTimeZone('')).toBe(true));
  it('accepts a real IANA zone', () => expect(isValidTimeZone('America/New_York')).toBe(true));
  it('rejects an invalid zone', () => expect(isValidTimeZone('Not/AZone')).toBe(false));
});

describe('formatClock', () => {
  const now = new Date('2026-01-01T13:05:09Z');

  it('formats 24-hour HH:MM in the given zone', () => {
    expect(formatClock(now, { timeZone: 'UTC', hour12: false, showSeconds: false, showDate: false, locale: 'en-US' }).time).toBe('13:05');
  });

  it('includes seconds when requested', () => {
    expect(formatClock(now, { timeZone: 'UTC', hour12: false, showSeconds: true, showDate: false, locale: 'en-US' }).time).toBe('13:05:09');
  });

  it('uses 12-hour format when hour12 is set', () => {
    const t = formatClock(now, { timeZone: 'UTC', hour12: true, showSeconds: false, showDate: false, locale: 'en-US' }).time;
    expect(t).toMatch(/01:05/);
    expect(t).toMatch(/PM/i);
  });

  it('returns a date string only when showDate is set', () => {
    expect(formatClock(now, { timeZone: 'UTC', hour12: false, showSeconds: false, showDate: false, locale: 'en-US' }).date).toBeNull();
    expect(formatClock(now, { timeZone: 'UTC', hour12: false, showSeconds: false, showDate: true, locale: 'en-US' }).date).toBeTruthy();
  });

  it('does not throw on an invalid zone (falls back to local)', () => {
    expect(() => formatClock(now, { timeZone: 'Bad/Zone', hour12: false, showSeconds: false, showDate: false, locale: 'en-US' })).not.toThrow();
  });
});
