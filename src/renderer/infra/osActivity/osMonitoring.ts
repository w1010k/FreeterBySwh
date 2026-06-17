/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcSetOsMonitoringArgs, ipcSetOsMonitoringChannel, IpcSetOsMonitoringRes } from '@common/ipc/channels';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

/** Ask the main process to start/stop OS-wide activity monitoring. */
export function setOsMonitoring(enabled: boolean): Promise<IpcSetOsMonitoringRes> {
  return electronIpcRenderer.invoke<IpcSetOsMonitoringArgs, IpcSetOsMonitoringRes>(ipcSetOsMonitoringChannel, enabled);
}
