/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { FlushTelemetryUseCase } from '@/application/useCases/telemetry/flushTelemetry';
import { GetTelemetryEntitiesUseCase } from '@/application/useCases/telemetry/getTelemetryEntities';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';

type Deps = {
  flushTelemetryUseCase: FlushTelemetryUseCase;
  getTelemetryEntitiesUseCase: GetTelemetryEntitiesUseCase;
  dialogProvider: DialogProvider;
  /** Main-side: serve the page locally and open it in the default browser. */
  openAnalyticsInBrowser: (entities: TelemetryEntitiesSnapshot) => Promise<void>;
}

/**
 * View → Analytics: opens the usage report in the default browser, where all
 * of its controls (range, export, delete) live. Works with collection consent
 * off too, so someone who opted out can still review or delete what was
 * already collected (consent gates collection, not access to existing data).
 */
export function createOpenAnalyticsUseCase({
  flushTelemetryUseCase,
  getTelemetryEntitiesUseCase,
  dialogProvider,
  openAnalyticsInBrowser,
}: Deps) {
  return async function openAnalyticsUseCase(): Promise<void> {
    // Persist the in-memory buffer (closing the running active interval) so the
    // page shows activity up to now; the periodic flush runs only every 15s.
    // With consent off the buffer is empty, so this is a no-op.
    await flushTelemetryUseCase();
    try {
      await openAnalyticsInBrowser(getTelemetryEntitiesUseCase());
    } catch {
      await dialogProvider.showMessageBox({ type: 'warning', message: 'Analytics 페이지를 열지 못했습니다.' });
    }
  }
}

export type OpenAnalyticsUseCase = ReturnType<typeof createOpenAnalyticsUseCase>;
