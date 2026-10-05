/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTelemetryBuffer, TelemetryAppendError } from '@/infra/telemetry/telemetryBuffer';
import { DataStorage, DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent } from '@common/base/telemetry';

// Keeps parsed values in `store` and raw text in `raw`, like the file-backed storage.
function fakeStorage() {
  const store = new Map<string, unknown>();
  const raw = new Map<string, string>();
  const getText = jest.fn(async (key: string) => raw.get(key));
  const storage: DataStorage & DataStorageJson = {
    getText,
    setText: async (key, text) => {
      raw.set(key, text);
      try {
        store.set(key, JSON.parse(text));
      } catch {
        store.delete(key);
      }
    },
    deleteItem: async (key) => { raw.delete(key); store.delete(key); },
    clear: async () => { raw.clear(); store.clear(); },
    getKeys: async () => [...raw.keys()],
    getJson: async (key) => store.get(key),
    setJson: async (key, json) => { raw.set(key, JSON.stringify(json)); store.set(key, json); }
  };
  return { store, raw, getText, storage };
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

  it('backs up a day file it cannot parse under a corrupt- key, then starts the day fresh', async () => {
    const { raw, storage } = fakeStorage();
    raw.set('events-2026-06-17', '[{"ts":1,"type":"app_fo');
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });

    await buffer.appendEvents([ev(2)]);

    const backupKeys = [...raw.keys()].filter(k => k.startsWith('corrupt-events-2026-06-17-'));
    expect(backupKeys).toHaveLength(1);
    expect(raw.get(backupKeys[0])).toBe('[{"ts":1,"type":"app_fo');
    expect(JSON.parse(raw.get('events-2026-06-17') ?? '')).toEqual([ev(2)]);
  });

  it('writes the readable days of a batch and reports only the failed day back', async () => {
    const { raw, getText, storage } = fakeStorage();
    raw.set('events-2026-06-17', JSON.stringify([ev(1)]));
    raw.set('events-2026-06-18', JSON.stringify([ev(100)]));
    getText.mockImplementation(async (key: string) => key === 'events-2026-06-18' ? undefined : raw.get(key));
    const buffer = createTelemetryBuffer({ storage, dateOf: ts => ts < 100 ? '2026-06-17' : '2026-06-18' });

    const err = await buffer.appendEvents([ev(2), ev(200)]).catch(e => e);

    expect(err).toBeInstanceOf(TelemetryAppendError);
    expect((err as TelemetryAppendError).failed).toEqual([ev(200)]);
    expect(JSON.parse(raw.get('events-2026-06-17') ?? '')).toEqual([ev(1), ev(2)]);
    expect(JSON.parse(raw.get('events-2026-06-18') ?? '')).toEqual([ev(100)]);
  });

  it('does not overwrite a day file whose read failed', async () => {
    const { raw, getText, storage } = fakeStorage();
    raw.set('events-2026-06-17', JSON.stringify([ev(1)]));
    getText.mockResolvedValueOnce(undefined); // locked file: read fails, file still listed
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });

    await expect(buffer.appendEvents([ev(2)])).rejects.toThrow();
    await buffer.appendEvents([ev(2)]);

    expect(JSON.parse(raw.get('events-2026-06-17') ?? '')).toEqual([ev(1), ev(2)]);
  });

  it('reads a day file once and appends from memory afterwards', async () => {
    const { store, raw, getText, storage } = fakeStorage();
    raw.set('events-2026-06-17', JSON.stringify([ev(1)]));
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });

    await buffer.appendEvents([ev(2)]);
    await buffer.appendEvents([ev(3)]);

    expect(getText).toHaveBeenCalledTimes(1);
    expect(store.get('events-2026-06-17')).toEqual([ev(1), ev(2), ev(3)]);
  });

  it('drops the cached day when the file was cleared behind it (Analytics Clear)', async () => {
    const { raw, storage } = fakeStorage();
    const buffer = createTelemetryBuffer({ storage, dateOf: () => '2026-06-17' });
    await buffer.appendEvents([ev(1)]);

    await storage.clear();
    await buffer.appendEvents([ev(2)]);

    expect(JSON.parse(raw.get('events-2026-06-17') ?? '')).toEqual([ev(2)]);
  });
})
