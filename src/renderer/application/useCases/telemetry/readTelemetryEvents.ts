/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage, DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent, telemetryEventsKey, telemetryEventsKeyPrefix } from '@common/base/telemetry';

export interface TelemetryDay {
  date: string;
  events: TelemetryEvent[];
}

type TelemetryStorage = Pick<DataStorage, 'getKeys'> & DataStorageJson;

interface Deps {
  telemetryStorage: TelemetryStorage;
}

/**
 * Reads every persisted day's raw events, sorted by date ascending. Days outside
 * an optional [fromDate, toDate] (inclusive, 'YYYY-MM-DD' string compare) are skipped.
 */
export function createReadTelemetryEventsUseCase({ telemetryStorage }: Deps) {
  return async function readTelemetryEventsUseCase(fromDate?: string, toDate?: string): Promise<TelemetryDay[]> {
    const keys = await telemetryStorage.getKeys();
    const dates = keys
      .filter(k => k.startsWith(telemetryEventsKeyPrefix))
      .map(k => k.slice(telemetryEventsKeyPrefix.length))
      .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .filter(date => (!fromDate || date >= fromDate) && (!toDate || date <= toDate))
      .sort();

    const days = await Promise.all(dates.map(async date => {
      const raw = await telemetryStorage.getJson(telemetryEventsKey(date));
      const events = Array.isArray(raw) ? raw as TelemetryEvent[] : [];
      return { date, events };
    }));

    return days;
  }
}

export type ReadTelemetryEventsUseCase = ReturnType<typeof createReadTelemetryEventsUseCase>;
