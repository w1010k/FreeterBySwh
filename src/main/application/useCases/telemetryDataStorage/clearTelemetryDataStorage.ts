/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

interface Deps {
  telemetryDataStorage: DataStorage;
}

export function createClearTelemetryDataStorageUseCase({ telemetryDataStorage }: Deps) {
  return async function clearTelemetryDataStorageUseCase(): Promise<void> {
    return telemetryDataStorage.clear();
  }
}

export type ClearTelemetryDataStorageUseCase = ReturnType<typeof createClearTelemetryDataStorageUseCase>;
