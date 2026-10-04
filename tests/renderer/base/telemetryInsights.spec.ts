/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  allocateByProject,
  buildWorkBlocks,
  computeFocusStats,
  OsSegment,
  previousPeriod,
  quickRange,
  summarizeDayActivity,
  toOsSegments,
} from '@/base/telemetryInsights';
import { DailyRollup, TelemetryEntitiesSnapshot } from '@common/base/telemetry';

const MIN = 60_000;
/** Local 2026-03-02 at h:m, so hour buckets don't depend on the test machine's timezone. */
const at = (h: number, m = 0, s = 0) => new Date(2026, 2, 2, h, m, s).getTime();
const seg = (app: string, start: number, ms: number, title = ''): OsSegment => ({ app, start, end: start + ms, title });

describe('toOsSegments', () => {
  it('rebuilds segments from os_window end timestamps, sorted by start, skipping other events', () => {
    const segs = toOsSegments([
      { ts: at(10, 5), type: 'os_window', text: 'Code', detail: 'a.ts', durationMs: 5 * MIN },
      { ts: at(9, 30), type: 'os_window', text: 'chrome', durationMs: 30 * MIN },
      { ts: at(9, 40), type: 'page_visit', text: 'x' },
    ]);
    expect(segs).toEqual([
      { app: 'chrome', start: at(9), end: at(9, 30), title: '' },
      { app: 'Code', start: at(10), end: at(10, 5), title: 'a.ts' },
    ]);
  });
});

describe('buildWorkBlocks', () => {
  it('folds brief detours (even nested ones) into the surrounding block and keeps its titles', () => {
    const blocks = buildWorkBlocks([
      seg('Code', at(9), 20 * MIN, 'a.ts'),
      seg('Slack', at(9, 20), 30_000, 'dm'),
      seg('Code', at(9, 20, 30), 10 * MIN, 'b.ts'),
      seg('chrome', at(9, 30, 30), 20_000),
      seg('Slack', at(9, 30, 50), 10_000),
      seg('chrome', at(9, 31), 10_000),
      seg('Code', at(9, 31, 10), 5 * MIN, 'a.ts'),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ app: 'Code', start: at(9), end: at(9, 36, 10), interruptions: 2 });
    expect(blocks[0].titles).toEqual([{ title: 'a.ts', ms: 25 * MIN }, { title: 'b.ts', ms: 10 * MIN }]);
  });

  it('folds a brief detour through several apps', () => {
    const blocks = buildWorkBlocks([
      seg('Code', at(9), 15 * MIN),
      seg('Slack', at(9, 15), 20_000),
      seg('chrome', at(9, 15, 20), 20_000),
      seg('Code', at(9, 15, 40), 15 * MIN),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ app: 'Code', ms: 30 * MIN + 40_000, interruptions: 1 });
  });

  it('keeps a detour whose apps add up to a minute or more as separate blocks', () => {
    const blocks = buildWorkBlocks([
      seg('Code', at(9), 15 * MIN),
      seg('Slack', at(9, 15), 40_000),
      seg('chrome', at(9, 15, 40), 40_000),
      seg('Code', at(9, 17), 15 * MIN),
    ]);
    expect(blocks.map(b => b.app)).toEqual(['Code', 'Slack', 'chrome', 'Code']);
  });

  it('starts a new block on a long detour or a long pause', () => {
    const blocks = buildWorkBlocks([
      seg('Code', at(9), 10 * MIN),
      seg('chrome', at(9, 10), 2 * MIN),
      seg('Code', at(9, 12), 10 * MIN),
      seg('Code', at(10), 10 * MIN),
    ]);
    expect(blocks.map(b => [b.app, b.start])).toEqual([['Code', at(9)], ['chrome', at(9, 10)], ['Code', at(9, 12)], ['Code', at(10)]]);
  });
});

describe('computeFocusStats', () => {
  it('counts switches, interrupters, focus blocks and splits time across hours', () => {
    const s = computeFocusStats([
      seg('Code', at(9, 50), 30 * MIN),
      seg('Slack', at(10, 20), 5_000),
      seg('Code', at(10, 20, 5), 5 * MIN),
      seg('Code', at(12), 5 * MIN),
      seg('chrome', at(12, 5), 2 * MIN),
    ]);
    expect(s.switches).toBe(3);
    expect(s.shortSegments).toBe(1);
    expect(s.interrupters).toEqual([{ app: 'Slack', count: 1 }]);
    expect(s.focusBlocks).toBe(1);
    expect(s.longestBlockMs).toBe(35 * MIN + 5_000);
    expect(s.perHourMs[9]).toBe(10 * MIN);
    expect(s.perHourMs[10]).toBe(25 * MIN + 5_000);
    expect(s.perHourSwitches[10]).toBe(2);
    expect(s.osMs).toBe(42 * MIN + 5_000);
  });

  it("doesn't count an app change across a long pause as a switch", () => {
    expect(computeFocusStats([seg('Code', at(9), MIN), seg('chrome', at(11), MIN)]).switches).toBe(0);
  });
});

describe('allocateByProject', () => {
  const entities: TelemetryEntitiesSnapshot = {
    projects: [{ id: 'p1', name: 'Work' }],
    workflows: [{ id: 'w1', name: 'Inbox', prjId: 'p1' }, { id: 'w2', name: 'Dev', prjId: 'p1' }],
    widgets: [],
  };
  const rollup = (perWorkflowMs: Record<string, number>): DailyRollup => ({
    date: '2026-03-02', activeMs: 0, sessionCount: 0, keystrokeCount: 0, typingActiveMs: 0, perWorkflowMs, perAppMs: {}, perHour: [],
  });

  it('sums workflows across days under their project and groups unknown ones', () => {
    const r = allocateByProject([rollup({ w1: 10, w2: 30 }), rollup({ w1: 5, gone1234567: 50 })], entities);
    expect(r).toEqual([
      { prjId: '', name: '(삭제된 워크플로)', ms: 50, workflows: [{ wflId: 'gone1234567', name: '(삭제됨: gone1234)', ms: 50 }] },
      { prjId: 'p1', name: 'Work', ms: 45, workflows: [{ wflId: 'w2', name: 'Dev', ms: 30 }, { wflId: 'w1', name: 'Inbox', ms: 15 }] },
    ]);
  });
});

describe('summarizeDayActivity', () => {
  it('groups page visits by host and keeps other activity in time order', () => {
    const r = summarizeDayActivity([
      { ts: 3, type: 'page_visit', text: 'B', detail: 'https://app.slack.com/b' },
      { ts: 1, type: 'page_visit', text: 'A', detail: 'https://app.slack.com/a' },
      { ts: 2, type: 'page_visit', text: 'G', detail: 'not a url' },
      { ts: 5, type: 'web_search', text: 'q2' },
      { ts: 4, type: 'web_search', text: 'q1' },
    ]);
    expect(r.pagesByHost).toEqual([{ host: 'app.slack.com', count: 2, titles: ['A', 'B'] }, { host: 'not a url', count: 1, titles: ['G'] }]);
    expect(r.searches.map(x => x.text)).toEqual(['q1', 'q2']);
  });
});

describe('date ranges', () => {
  it('builds inclusive quick ranges ending today, clamping month ends', () => {
    expect(quickRange('7d', '2026-03-02')).toEqual({ from: '2026-02-24', to: '2026-03-02' });
    expect(quickRange('6m', '2026-08-31')).toEqual({ from: '2026-03-01', to: '2026-08-31' });
    expect(quickRange('1y', '2026-10-04')).toEqual({ from: '2025-10-05', to: '2026-10-04' });
  });

  it('returns the equally long previous period', () => {
    expect(previousPeriod('2026-03-01', '2026-03-07')).toEqual({ from: '2026-02-22', to: '2026-02-28' });
  });
});
