/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { buildTelemetryExport } from '@/base/telemetryExport';
import { telemetrySchemaVersion, TelemetryEntitiesSnapshot, TelemetryEvent, DailyRollup } from '@common/base/telemetry';

const entities: TelemetryEntitiesSnapshot = {
  projects: [{ id: 'p1', name: 'P1' }],
  workflows: [{ id: 'w1', name: 'W1', prjId: 'p1' }],
  widgets: [],
};
const events: TelemetryEvent[] = [{ ts: 1, type: 'app_focus' }, { ts: 2, type: 'workflow_close', wflId: 'w1', durationMs: 100 }];
const daily: DailyRollup[] = [{
  date: '2026-06-17', activeMs: 0, sessionCount: 1, keystrokeCount: 0,
  typingActiveMs: 0, perWorkflowMs: { w1: 100 }, perAppMs: {}, perHour: new Array<number>(24).fill(0),
}];

describe('buildTelemetryExport', () => {
  it('builds a self-describing bundle with manifest, entities, events, daily and readme', () => {
    const bundle = buildTelemetryExport({
      events, daily, entities, generatedAt: '2026-06-17T00:00:00.000Z', timezone: 'Asia/Seoul',
    });

    expect(bundle.manifest.schemaVersion).toBe(telemetrySchemaVersion);
    expect(bundle.manifest.generatedAt).toBe('2026-06-17T00:00:00.000Z');
    expect(bundle.manifest.timezone).toBe('Asia/Seoul');
    expect(bundle.manifest.eventCount).toBe(2);
    expect(bundle.manifest.dayCount).toBe(1);
    expect(Object.keys(bundle.manifest.fields).length).toBeGreaterThan(0);
    expect(bundle.manifest.eventTypes.app_focus).toBeTruthy();
    expect(bundle.events).toBe(events);
    expect(bundle.daily).toBe(daily);
    expect(bundle.entities).toBe(entities);
    expect(typeof bundle.readme).toBe('string');
  });

  it('serializes to valid JSON', () => {
    const bundle = buildTelemetryExport({ events, daily, entities, generatedAt: 'x', timezone: 'UTC' });
    expect(() => JSON.parse(JSON.stringify(bundle))).not.toThrow();
  });
})
