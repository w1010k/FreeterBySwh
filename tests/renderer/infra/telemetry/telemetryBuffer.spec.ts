/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTelemetryBuffer } from '@/infra/telemetry/telemetryBuffer';
import { DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent } from '@common/base/telemetry';

function fakeStorage() {
  const store = new Map<string, unknown>();
  const storage: DataStorageJson = {
    getJson: async (key) => store.get(key),
    setJson: async (key, json) => { store.set(key, json); }
  };
  return { store, storage };
}

const ev = (ts: number, type: TelemetryEvent['type'] = 'app_focus'): TelemetryEvent => ({ ts, type });

describe('telemetryBuffer', () => {
  it('appends events grouped into per-day keys', async () => {
    const { store, storage } = fakeStorage();
    const buffer = createTelemetryBuffer({ storage, dateOf: ts => ts < 100 ? '2026-06-17' : '2026-06-18' });

    await buffer.appendEvents([ev(1), ev(2), ev(200)]);

    expect(store.get('events-2026-06-17')).toEqual([ev(1), ev(2)]);
    expect(store.get('events-2026-06-18')).toEqual([ev(200)]);
  });

  it('merges with previously stored events', async () => {
    const { store, storage } = fakeStorage();
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });
    await buffer.appendEvents([ev(1)]);

    await buffer.appendEvents([ev(2)]);

    expect(store.get('events-2026-06-17')).toEqual([ev(1), ev(2)]);
  });

  it('serializes concurrent appends without clobbering', async () => {
    const { store, storage } = fakeStorage();
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });

    await Promise.all([
      buffer.appendEvents([ev(1)]),
      buffer.appendEvents([ev(2)]),
      buffer.appendEvents([ev(3)]),
    ]);

    expect(store.get('events-2026-06-17')).toEqual([ev(1), ev(2), ev(3)]);
  });

  it('no-ops on empty input', async () => {
    const { store, storage } = fakeStorage();
    const buffer = createTelemetryBuffer({ storage });

    await buffer.appendEvents([]);

    expect(store.size).toBe(0);
  });
})
