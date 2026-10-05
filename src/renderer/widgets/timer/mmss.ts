/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

function pad2(n: number) {
  return ('0' + n).slice(-2);
}

/**
 * Formats a countdown's remaining time as MM:SS for the Timer and Pomodoro
 * widgets. Clamped at 0: the last tick can land a few ms past the end, which
 * must read 00:00, not a negative time.
 */
export function msecsToMMSS(msecs: number) {
  const secs = Math.max(0, Math.floor(msecs / 1000));
  return `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`;
}
