/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcGetSystemStatsArgs, IpcGetSystemStatsRes, ipcGetSystemStatsChannel } from '@common/ipc/channels';
import { GetSystemStatsUseCase } from '@/application/useCases/systemStats/getSystemStats';

type Deps = {
  getSystemStatsUseCase: GetSystemStatsUseCase;
}

export function createSystemStatsControllers({
  getSystemStatsUseCase,
}: Deps): [
    Controller<IpcGetSystemStatsArgs, IpcGetSystemStatsRes>,
  ] {
  return [{
    channel: ipcGetSystemStatsChannel,
    handle: async () => getSystemStatsUseCase()
  }]
}
