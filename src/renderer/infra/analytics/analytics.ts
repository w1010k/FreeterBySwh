/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';
import { IpcOpenAnalyticsArgs, ipcOpenAnalyticsChannel, IpcOpenAnalyticsRes } from '@common/ipc/channels';

/** Ask main to serve the Analytics page (with this id→name snapshot) and open it in the default browser. */
export function openAnalyticsInBrowser(entities: TelemetryEntitiesSnapshot): Promise<IpcOpenAnalyticsRes> {
  return electronIpcRenderer.invoke<IpcOpenAnalyticsArgs, IpcOpenAnalyticsRes>(ipcOpenAnalyticsChannel, entities);
}
