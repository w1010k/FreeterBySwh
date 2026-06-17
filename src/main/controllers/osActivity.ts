/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { SetOsMonitoringUseCase } from '@/application/useCases/osActivity/setOsMonitoring';
import { Controller } from '@/controllers/controller';
import { IpcSetOsMonitoringArgs, ipcSetOsMonitoringChannel, IpcSetOsMonitoringRes } from '@common/ipc/channels';

type Deps = {
  setOsMonitoringUseCase: SetOsMonitoringUseCase;
}

export function createOsActivityControllers({
  setOsMonitoringUseCase,
}: Deps): [
    Controller<IpcSetOsMonitoringArgs, IpcSetOsMonitoringRes>
  ] {
  return [{
    channel: ipcSetOsMonitoringChannel,
    handle: async (_event, enabled) => setOsMonitoringUseCase(enabled)
  }]
}
