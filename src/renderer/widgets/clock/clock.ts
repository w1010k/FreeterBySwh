/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

export interface ClockFormatOpts {
  /** IANA time zone (e.g. 'America/New_York'). Empty = local zone. */
  timeZone?: string;
  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
  /** Override locale (mainly for deterministic tests); defaults to system. */
  locale?: string | string[];
}

export interface ClockParts {
  time: string;
  date: string | null;
}

/** True if `tz` is a usable IANA time zone (empty string counts as local = valid). */
export function isValidTimeZone(tz: string): boolean {
  if (tz === '') {
    return true;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Format a moment as a clock's time (+ optional date) for the given options. */
export function formatClock(now: Date, opts: ClockFormatOpts): ClockParts {
  const timeZone = opts.timeZone && isValidTimeZone(opts.timeZone) ? opts.timeZone : undefined;
  const time = new Intl.DateTimeFormat(opts.locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(opts.showSeconds ? { second: '2-digit' } : {}),
    hour12: opts.hour12,
  }).format(now);

  const date = opts.showDate
    ? new Intl.DateTimeFormat(opts.locale, {
        timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      }).format(now)
    : null;

  return { time, date };
}
