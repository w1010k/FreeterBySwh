/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

interface Deps {
  telemetryDataStorage: DataStorage;
}

export function createSetTextInTelemetryDataStorageUseCase({ telemetryDataStorage }: Deps) {
  return async function setTextInTelemetryDataStorageUseCase(key: string, text: string): Promise<void> {
    return telemetryDataStorage.setText(key, text);
  }
}

export type SetTextInTelemetryDataStorageUseCase = ReturnType<typeof createSetTextInTelemetryDataStorageUseCase>;
