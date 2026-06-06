/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { ipcSetDownloadDirChannel, IpcSetDownloadDirArgs, IpcSetDownloadDirRes } from '@common/ipc/channels';
import { SetDownloadDirUseCase } from '@/application/useCases/download/setDownloadDir';

type Deps = {
  setDownloadDirUseCase: SetDownloadDirUseCase;
}

export function createDownloadControllers({
  setDownloadDirUseCase,
}: Deps): [
    Controller<IpcSetDownloadDirArgs, IpcSetDownloadDirRes>,
  ] {
  return [{
    channel: ipcSetDownloadDirChannel,
    handle: async (_event, dir) => {
      setDownloadDirUseCase(dir);
    }
  }]
}
