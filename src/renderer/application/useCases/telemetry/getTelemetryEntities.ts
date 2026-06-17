/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';

interface Deps {
  appStore: AppStore;
}

/**
 * Builds an id→name snapshot of projects/workflows/widgets from current state.
 * Used to resolve the bare ids in the event log to display names.
 */
export function createGetTelemetryEntitiesUseCase({ appStore }: Deps) {
  return function getTelemetryEntitiesUseCase(): TelemetryEntitiesSnapshot {
    const { entities } = appStore.get();

    const projects = Object.values(entities.projects)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(p => ({ id: p.id, name: p.settings.name }));

    const wflToPrj: Record<string, string> = {};
    for (const p of Object.values(entities.projects)) {
      if (p) {
        for (const wflId of p.workflowIds) {
          wflToPrj[wflId] = p.id;
        }
      }
    }

    const workflows = Object.values(entities.workflows)
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map(w => ({ id: w.id, name: w.settings.name, prjId: wflToPrj[w.id] ?? '' }));

    const widgets = Object.values(entities.widgets)
      .filter((w): w is NonNullable<typeof w> => !!w)
      .map(w => ({ id: w.id, type: w.type, name: w.coreSettings.name }));

    return { projects, workflows, widgets };
  }
}

export type GetTelemetryEntitiesUseCase = ReturnType<typeof createGetTelemetryEntitiesUseCase>;
