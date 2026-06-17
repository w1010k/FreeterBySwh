/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { GetTelemetryEntitiesUseCase } from '@/application/useCases/telemetry/getTelemetryEntities';
import { GetTelemetryRollupsUseCase } from '@/application/useCases/telemetry/getTelemetryRollups';
import { ReadTelemetryEventsUseCase } from '@/application/useCases/telemetry/readTelemetryEvents';
import { buildTelemetryExport } from '@/base/telemetryExport';

interface Deps {
  readTelemetryEventsUseCase: ReadTelemetryEventsUseCase;
  getTelemetryRollupsUseCase: GetTelemetryRollupsUseCase;
  getTelemetryEntitiesUseCase: GetTelemetryEntitiesUseCase;
  dialogProvider: DialogProvider;
  fsProvider: FsProvider;
}

export type ExportTelemetryResult =
  | { status: 'saved'; filePath: string }
  | { status: 'canceled' }
  | { status: 'error' };

export function createExportTelemetryDataUseCase({
  readTelemetryEventsUseCase,
  getTelemetryRollupsUseCase,
  getTelemetryEntitiesUseCase,
  dialogProvider,
  fsProvider,
}: Deps) {
  return async function exportTelemetryDataUseCase(): Promise<ExportTelemetryResult> {
    const days = await readTelemetryEventsUseCase();
    const events = days.flatMap(d => d.events);
    const daily = await getTelemetryRollupsUseCase();
    const entities = getTelemetryEntitiesUseCase();

    const bundle = buildTelemetryExport({
      events,
      daily,
      entities,
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    const res = await dialogProvider.showSaveFileDialog({
      title: 'Export usage activity',
      defaultPath: 'freeter-activity-export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) {
      return { status: 'canceled' };
    }

    const ok = await fsProvider.writeTextFile(res.filePath, JSON.stringify(bundle, null, 2));
    return ok ? { status: 'saved', filePath: res.filePath } : { status: 'error' };
  }
}

export type ExportTelemetryDataUseCase = ReturnType<typeof createExportTelemetryDataUseCase>;
