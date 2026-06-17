/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

interface Deps {
  telemetryDataStorage: DataStorage;
}

export function createGetTextFromTelemetryDataStorageUseCase({ telemetryDataStorage }: Deps) {
  return async function getTextFromTelemetryDataStorageUseCase(key: string): Promise<string | undefined> {
    return telemetryDataStorage.getText(key);
  }
}

export type GetTextFromTelemetryDataStorageUseCase = ReturnType<typeof createGetTextFromTelemetryDataStorageUseCase>;
