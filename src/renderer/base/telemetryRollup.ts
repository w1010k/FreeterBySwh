/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DailyRollup, TelemetryEvent } from '@common/base/telemetry';

export function emptyDailyRollup(date: string): DailyRollup {
  return {
    date,
    activeMs: 0,
    sessionCount: 0,
    keystrokeCount: 0,
    typingActiveMs: 0,
    perWorkflowMs: {},
    perAppMs: {},
    perHour: new Array<number>(24).fill(0),
  }
}

/**
 * Aggregates one local day's raw events into a DailyRollup. Pure given an
 * hour-of-day resolver (injected for deterministic tests).
 */
export function computeDailyRollup(
  date: string,
  events: readonly TelemetryEvent[],
  hourOf: (ts: number) => number = (ts) => new Date(ts).getHours()
): DailyRollup {
  let activeMs = 0;
  let sessionCount = 0;
  let keystrokeCount = 0;
  let typingActiveMs = 0;
  const perWorkflowMs: Record<string, number> = {};
  const perAppMs: Record<string, number> = {};
  const perHour = new Array<number>(24).fill(0);

  for (const ev of events) {
    switch (ev.type) {
      case 'activity_tick': {
        const dur = ev.durationMs ?? 0;
        const count = ev.count ?? 0;
        activeMs += dur;
        keystrokeCount += count;
        if (count > 0) {
          typingActiveMs += dur;
        }
        const hour = hourOf(ev.ts);
        if (hour >= 0 && hour < 24) {
          perHour[hour] += dur;
        }
        break;
      }
      case 'app_focus':
        sessionCount += 1;
        break;
      case 'workflow_close':
        if (ev.wflId) {
          perWorkflowMs[ev.wflId] = (perWorkflowMs[ev.wflId] ?? 0) + (ev.durationMs ?? 0);
        }
        break;
      case 'os_window':
        if (ev.text) {
          perAppMs[ev.text] = (perAppMs[ev.text] ?? 0) + (ev.durationMs ?? 0);
        }
        break;
      default:
        break;
    }
  }

  return { date, activeMs, sessionCount, keystrokeCount, typingActiveMs, perWorkflowMs, perAppMs, perHour };
}
