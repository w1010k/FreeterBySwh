/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReadTelemetryEventsUseCase } from '@/application/useCases/telemetry/readTelemetryEvents';
import { computeDailyRollup } from '@/base/telemetryRollup';
import { DailyRollup } from '@common/base/telemetry';

interface Deps {
  readTelemetryEventsUseCase: ReadTelemetryEventsUseCase;
}

/**
 * Reads raw events and aggregates each day on the fly. Kept on-read (rather than
 * persisting rollups) for v1: always correct, no staleness, data volume is small.
 */
export function createGetTelemetryRollupsUseCase({ readTelemetryEventsUseCase }: Deps) {
  return async function getTelemetryRollupsUseCase(fromDate?: string, toDate?: string): Promise<DailyRollup[]> {
    const days = await readTelemetryEventsUseCase(fromDate, toDate);
    return days.map(({ date, events }) => computeDailyRollup(date, events));
  }
}

export type GetTelemetryRollupsUseCase = ReturnType<typeof createGetTelemetryRollupsUseCase>;
