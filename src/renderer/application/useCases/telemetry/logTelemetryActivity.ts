/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TelemetryActivityOpts, TelemetryCollector } from '@/application/telemetry/telemetryCollector';
import { TelemetryEventType } from '@common/base/telemetry';

interface Deps {
  telemetryCollector: TelemetryCollector;
}

/**
 * Records a semantic activity-timeline event (web_search, page_visit, file_open,
 * todo_done). Gated on consent inside the collector — a no-op when disabled.
 */
export function createLogTelemetryActivityUseCase({ telemetryCollector }: Deps) {
  return function logTelemetryActivityUseCase(type: TelemetryEventType, opts?: TelemetryActivityOpts): void {
    telemetryCollector.recordActivity(type, opts);
  }
}

export type LogTelemetryActivityUseCase = ReturnType<typeof createLogTelemetryActivityUseCase>;
