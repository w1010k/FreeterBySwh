/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createReadTelemetryEventsUseCase } from '@/application/useCases/telemetry/readTelemetryEvents';
import { createGetTelemetryRollupsUseCase } from '@/application/useCases/telemetry/getTelemetryRollups';
import { DataStorage, DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent } from '@common/base/telemetry';

function setup(data: Record<string, TelemetryEvent[]>) {
  const store = new Map<string, unknown>(Object.entries(data));
  const telemetryStorage: Pick<DataStorage, 'getKeys'> & DataStorageJson = {
    getKeys: async () => [...store.keys()],
    getJson: async (key) => store.get(key),
    setJson: async (key, json) => { store.set(key, json); },
  };
  const readTelemetryEventsUseCase = createReadTelemetryEventsUseCase({ telemetryStorage });
  const getTelemetryRollupsUseCase = createGetTelemetryRollupsUseCase({ readTelemetryEventsUseCase });
  return { readTelemetryEventsUseCase, getTelemetryRollupsUseCase };
}

describe('readTelemetryEventsUseCase', () => {
  it('reads only event-* keys, sorted by date', async () => {
    const { readTelemetryEventsUseCase } = setup({
      'events-2026-06-18': [{ ts: 2, type: 'app_focus' }],
      'events-2026-06-17': [{ ts: 1, type: 'app_focus' }],
      'rollup-daily': [],
    });

    const days = await readTelemetryEventsUseCase();

    expect(days.map(d => d.date)).toEqual(['2026-06-17', '2026-06-18']);
  });

  it('filters by inclusive date range', async () => {
    const { readTelemetryEventsUseCase } = setup({
      'events-2026-06-16': [{ ts: 1, type: 'app_focus' }],
      'events-2026-06-17': [{ ts: 2, type: 'app_focus' }],
      'events-2026-06-18': [{ ts: 3, type: 'app_focus' }],
    });

    const days = await readTelemetryEventsUseCase('2026-06-17', '2026-06-17');

    expect(days.map(d => d.date)).toEqual(['2026-06-17']);
  });
});

describe('getTelemetryRollupsUseCase', () => {
  it('produces one rollup per day', async () => {
    const { getTelemetryRollupsUseCase } = setup({
      'events-2026-06-17': [
        { ts: 1, type: 'app_focus' },
        { ts: 2, type: 'activity_tick', durationMs: 1000, count: 3 },
        { ts: 3, type: 'workflow_close', wflId: 'w1', durationMs: 800 },
      ],
    });

    const rollups = await getTelemetryRollupsUseCase();

    expect(rollups).toHaveLength(1);
    expect(rollups[0]).toMatchObject({
      date: '2026-06-17',
      sessionCount: 1,
      activeMs: 1000,
      keystrokeCount: 3,
      perWorkflowMs: { w1: 800 },
    });
  });
})
