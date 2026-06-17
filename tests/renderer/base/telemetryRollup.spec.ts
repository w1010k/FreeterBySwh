/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { computeDailyRollup, emptyDailyRollup } from '@/base/telemetryRollup';
import { TelemetryEvent } from '@common/base/telemetry';

describe('computeDailyRollup', () => {
  it('returns an empty rollup for no events', () => {
    expect(computeDailyRollup('2026-06-17', [])).toEqual(emptyDailyRollup('2026-06-17'));
  });

  it('sums active time, keystrokes and typing-active time from activity ticks', () => {
    const events: TelemetryEvent[] = [
      { ts: 1, type: 'activity_tick', durationMs: 1000, count: 0 },
      { ts: 2, type: 'activity_tick', durationMs: 2000, count: 5 },
    ];
    const r = computeDailyRollup('2026-06-17', events, () => 9);

    expect(r.activeMs).toBe(3000);
    expect(r.keystrokeCount).toBe(5);
    expect(r.typingActiveMs).toBe(2000); // only the tick with keystrokes
  });

  it('counts sessions from app_focus events', () => {
    const events: TelemetryEvent[] = [
      { ts: 1, type: 'app_focus' },
      { ts: 2, type: 'app_blur', durationMs: 100 },
      { ts: 3, type: 'app_focus' },
    ];
    expect(computeDailyRollup('2026-06-17', events).sessionCount).toBe(2);
  });

  it('accumulates per-workflow time from workflow_close durations', () => {
    const events: TelemetryEvent[] = [
      { ts: 1, type: 'workflow_close', wflId: 'w1', durationMs: 1000 },
      { ts: 2, type: 'workflow_close', wflId: 'w2', durationMs: 500 },
      { ts: 3, type: 'workflow_close', wflId: 'w1', durationMs: 250 },
    ];
    expect(computeDailyRollup('2026-06-17', events).perWorkflowMs).toEqual({ w1: 1250, w2: 500 });
  });

  it('accumulates per-app time from os_window durations', () => {
    const events: TelemetryEvent[] = [
      { ts: 1, type: 'os_window', text: 'Code', detail: 'a.ts', durationMs: 1000 },
      { ts: 2, type: 'os_window', text: 'Chrome', detail: 'gh', durationMs: 500 },
      { ts: 3, type: 'os_window', text: 'Code', detail: 'b.ts', durationMs: 250 },
    ];
    expect(computeDailyRollup('2026-06-17', events).perAppMs).toEqual({ Code: 1250, Chrome: 500 });
  });

  it('buckets active time by hour of day', () => {
    const events: TelemetryEvent[] = [
      { ts: 100, type: 'activity_tick', durationMs: 1000 },
      { ts: 200, type: 'activity_tick', durationMs: 2000 },
    ];
    const hourOf = (ts: number) => ts < 150 ? 9 : 14;
    const r = computeDailyRollup('2026-06-17', events, hourOf);

    expect(r.perHour[9]).toBe(1000);
    expect(r.perHour[14]).toBe(2000);
    expect(r.perHour).toHaveLength(24);
  });
})
