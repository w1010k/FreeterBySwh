/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TelemetryCollector } from '@/application/telemetry/telemetryCollector';

interface Deps {
  telemetryCollector: TelemetryCollector;
}

/**
 * Prepare the telemetry log for an on-demand read (Analytics open/reload):
 * close the current active interval up to now so in-progress active time shows,
 * then persist everything still buffered in memory. The periodic flush is every
 * 15s / on blur, which the in-app modal doesn't trigger.
 */
export function createFlushTelemetryUseCase({ telemetryCollector }: Deps) {
  return function flushTelemetryUseCase(): Promise<void> {
    telemetryCollector.markActiveBoundary();
    return telemetryCollector.flush();
  }
}

export type FlushTelemetryUseCase = ReturnType<typeof createFlushTelemetryUseCase>;
