/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage } from '@common/application/interfaces/dataStorage';

interface Deps {
  telemetryStorage: Pick<DataStorage, 'clear'>;
}

export function createClearTelemetryDataUseCase({ telemetryStorage }: Deps) {
  return async function clearTelemetryDataUseCase(): Promise<void> {
    return telemetryStorage.clear();
  }
}

export type ClearTelemetryDataUseCase = ReturnType<typeof createClearTelemetryDataUseCase>;
