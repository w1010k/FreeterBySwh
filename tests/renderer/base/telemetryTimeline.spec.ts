/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { buildActivityTimeline } from '@/base/telemetryTimeline';
import { TelemetryDay } from '@/application/useCases/telemetry/readTelemetryEvents';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';

const entities: TelemetryEntitiesSnapshot = {
  projects: [],
  workflows: [{ id: 'w1', name: 'Dev', prjId: 'p1' }],
  widgets: [],
};

const timeOf = (ts: number) => `00:${`${ts}`.padStart(2, '0')}`;

describe('buildActivityTimeline', () => {
  it('keeps only activity events, resolves workflow names, sorts newest-first', () => {
    const days: TelemetryDay[] = [{
      date: '2026-06-17',
      events: [
        { ts: 1, type: 'app_focus' },
        { ts: 2, type: 'web_search', text: 'rust traits', wflId: 'w1' },
        { ts: 5, type: 'page_visit', text: 'Docs', detail: 'https://x/y', wflId: 'w1' },
        { ts: 3, type: 'activity_tick', durationMs: 100 },
        { ts: 4, type: 'todo_done', text: 'ship it' },
      ],
    }];

    const timeline = buildActivityTimeline(days, entities, timeOf);

    expect(timeline).toHaveLength(1);
    const entries = timeline[0].entries;
    expect(entries.map(e => e.type)).toEqual(['page_visit', 'todo_done', 'web_search']);
    expect(entries.find(e => e.type === 'web_search')).toMatchObject({ text: 'rust traits', workflowName: 'Dev' });
    expect(entries.find(e => e.type === 'page_visit')).toMatchObject({ detail: 'https://x/y' });
  });

  it('drops days with no activity events and sorts days newest-first', () => {
    const days: TelemetryDay[] = [
      { date: '2026-06-16', events: [{ ts: 1, type: 'app_focus' }] },
      { date: '2026-06-17', events: [{ ts: 2, type: 'web_search', text: 'q' }] },
    ];

    const timeline = buildActivityTimeline(days, entities, timeOf);

    expect(timeline.map(d => d.date)).toEqual(['2026-06-17']);
  });
})
