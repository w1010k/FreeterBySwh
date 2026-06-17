/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createInMemoryDataStorage } from '@common/infra/dataStorage/inMemoryDataStorage';
import { createGetTextFromTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/getTextFromTelemetryDataStorage';
import { createSetTextInTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/setTextInTelemetryDataStorage';
import { createDeleteInTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/deleteInTelemetryDataStorage';
import { createClearTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/clearTelemetryDataStorage';
import { createGetKeysFromTelemetryDataStorageUseCase } from '@/application/useCases/telemetryDataStorage/getKeysFromTelemetryDataStorage';

function setup() {
  const telemetryDataStorage = createInMemoryDataStorage();
  return {
    telemetryDataStorage,
    getText: createGetTextFromTelemetryDataStorageUseCase({ telemetryDataStorage }),
    setText: createSetTextInTelemetryDataStorageUseCase({ telemetryDataStorage }),
    deleteItem: createDeleteInTelemetryDataStorageUseCase({ telemetryDataStorage }),
    clear: createClearTelemetryDataStorageUseCase({ telemetryDataStorage }),
    getKeys: createGetKeysFromTelemetryDataStorageUseCase({ telemetryDataStorage }),
  }
}

describe('telemetryDataStorage use cases', () => {
  it('should round-trip text via set/get', async () => {
    const { setText, getText } = setup();

    await setText('events-2026-06-17', '[{"ts":1}]');

    expect(await getText('events-2026-06-17')).toBe('[{"ts":1}]');
  });

  it('should return undefined for a missing key', async () => {
    const { getText } = setup();

    expect(await getText('nope')).toBeUndefined();
  });

  it('should delete a single key', async () => {
    const { setText, deleteItem, getText } = setup();
    await setText('k1', 'v1');
    await setText('k2', 'v2');

    await deleteItem('k1');

    expect(await getText('k1')).toBeUndefined();
    expect(await getText('k2')).toBe('v2');
  });

  it('should list all keys', async () => {
    const { setText, getKeys } = setup();
    await setText('k1', 'v1');
    await setText('k2', 'v2');

    expect((await getKeys()).sort()).toEqual(['k1', 'k2']);
  });

  it('should clear all keys', async () => {
    const { setText, clear, getKeys } = setup();
    await setText('k1', 'v1');
    await setText('k2', 'v2');

    await clear();

    expect(await getKeys()).toEqual([]);
  });
})
