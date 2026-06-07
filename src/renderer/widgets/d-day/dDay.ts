/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface DDayResult {
  /** Display text: `D-30` (before), `D-DAY` (target day), `D+15` (after). */
  text: string;
  /** Whole days from today to the target (negative = past). 0 = today. */
  days: number;
  isToday: boolean;
}

/** Parse a `YYYY-MM-DD` string to a local-midnight Date, or null if invalid. */
export function parseLocalDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) {
    return null;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(year, month - 1, day);
  // Reject rolled-over values (e.g. 2026-02-31 -> Mar 3).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Whole-day distance between two dates, comparing local calendar days (so a
 * partial day or a DST transition never shifts the result). Positive = target
 * is in the future.
 */
function daysBetweenLocal(target: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Korean-style D-day for a `YYYY-MM-DD` target relative to `now` (defaults to
 * the current moment). The target day is `D-DAY`, days before it are `D-N`,
 * and days after it are `D+N`. Returns null for an empty/invalid date.
 */
export function formatDDay(dateStr: string, now: Date = new Date()): DDayResult | null {
  const target = parseLocalDate(dateStr);
  if (!target) {
    return null;
  }
  const days = daysBetweenLocal(target, now);
  if (days > 0) {
    return { text: `D-${days}`, days, isToday: false };
  }
  if (days < 0) {
    return { text: `D+${-days}`, days, isToday: false };
  }
  return { text: 'D-DAY', days: 0, isToday: true };
}

/**
 * `YYYY-MM-DD (weekday)` for display, e.g. `2026-07-07 (화)` / `(Tue)`. The
 * weekday short name follows the given locale (defaults to the system locale).
 * Returns null for an empty/invalid date.
 */
export function formatDateWithWeekday(dateStr: string, locale?: string | string[]): string | null {
  const date = parseLocalDate(dateStr);
  if (!date) {
    return null;
  }
  const weekday = date.toLocaleDateString(locale, { weekday: 'short' });
  return `${dateStr} (${weekday})`;
}
