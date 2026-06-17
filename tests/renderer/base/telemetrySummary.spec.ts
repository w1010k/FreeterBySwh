/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { formatDuration, summarizeTelemetry } from '@/base/telemetrySummary';
import { DailyRollup, TelemetryEntitiesSnapshot } from '@common/base/telemetry';

const entities: TelemetryEntitiesSnapshot = {
  projects: [{ id: 'p1', name: 'Project 1' }],
  workflows: [{ id: 'w1', name: 'Inbox', prjId: 'p1' }, { id: 'w2', name: 'Dev', prjId: 'p1' }],
  widgets: [],
};

const rollup = (over: Partial<DailyRollup>): DailyRollup => ({
  date: '2026-06-17',
  activeMs: 0,
  sessionCount: 0,
  keystrokeCount: 0,
  typingActiveMs: 0,
  perWorkflowMs: {},
  perAppMs: {},
  perHour: new Array<number>(24).fill(0),
  ...over,
});

describe('summarizeTelemetry', () => {
  it('totals metrics across days and sorts daily series by date', () => {
    const r = summarizeTelemetry([
      rollup({ date: '2026-06-18', activeMs: 2000, sessionCount: 1, keystrokeCount: 10, typingActiveMs: 500 }),
      rollup({ date: '2026-06-17', activeMs: 1000, sessionCount: 2, keystrokeCount: 5, typingActiveMs: 250 }),
    ], entities);

    expect(r.totalActiveMs).toBe(3000);
    expect(r.totalSessions).toBe(3);
    expect(r.totalKeystrokes).toBe(15);
    expect(r.totalTypingMs).toBe(750);
    expect(r.dayCount).toBe(2);
    expect(r.dailyActive.map(d => d.date)).toEqual(['2026-06-17', '2026-06-18']);
  });

  it('resolves workflow names and ranks top workflows by time', () => {
    const r = summarizeTelemetry([
      rollup({ perWorkflowMs: { w1: 1000, w2: 3000, wDeleted: 500 } }),
    ], entities);

    expect(r.topWorkflows[0]).toEqual({ wflId: 'w2', name: 'Dev', ms: 3000 });
    expect(r.topWorkflows[1]).toEqual({ wflId: 'w1', name: 'Inbox', ms: 1000 });
    expect(r.topWorkflows[2].name).toContain('삭제됨');
  });

  it('aggregates per-hour buckets', () => {
    const a = new Array<number>(24).fill(0); a[9] = 100;
    const b = new Array<number>(24).fill(0); b[9] = 50; b[14] = 200;
    const r = summarizeTelemetry([rollup({ perHour: a }), rollup({ perHour: b })], entities);

    expect(r.perHour[9]).toBe(150);
    expect(r.perHour[14]).toBe(200);
  });
});

describe('formatDuration', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(75 * 60_000)).toBe('1h 15m');
    expect(formatDuration(25 * 60 * 60_000)).toBe('1d 1h');
  });
})
