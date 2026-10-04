/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AnalyticsServer } from '@/application/interfaces/analyticsServer';
import { ShellProvider } from '@/application/interfaces/shellProvider';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';

interface Deps {
  analyticsServer: AnalyticsServer;
  shellProvider: ShellProvider;
}

/** Brings up the local analytics server and opens its page in the default browser. */
export function createOpenAnalyticsInBrowserUseCase({ analyticsServer, shellProvider }: Deps) {
  return async function openAnalyticsInBrowserUseCase(entities: TelemetryEntitiesSnapshot): Promise<void> {
    const url = await analyticsServer.open(entities);
    await shellProvider.openExternal(url);
  }
}

export type OpenAnalyticsInBrowserUseCase = ReturnType<typeof createOpenAnalyticsInBrowserUseCase>;
