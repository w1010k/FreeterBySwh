/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { OpenAnalyticsInBrowserUseCase } from '@/application/useCases/analytics/openAnalyticsInBrowser';
import { Controller } from '@/controllers/controller';
import { IpcOpenAnalyticsArgs, ipcOpenAnalyticsChannel, IpcOpenAnalyticsRes } from '@common/ipc/channels';

type Deps = {
  openAnalyticsInBrowserUseCase: OpenAnalyticsInBrowserUseCase;
}

export function createAnalyticsControllers({
  openAnalyticsInBrowserUseCase,
}: Deps): [
    Controller<IpcOpenAnalyticsArgs, IpcOpenAnalyticsRes>,
  ] {
  return [{
    channel: ipcOpenAnalyticsChannel,
    handle: async (_event, entities) => openAnalyticsInBrowserUseCase(entities)
  }]
}
