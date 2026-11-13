/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { BackUpAppDataUseCase } from '@/application/useCases/appDataBackup/backUpAppData';
import { RestoreAppDataUseCase } from '@/application/useCases/appDataBackup/restoreAppData';
import { Controller } from '@/controllers/controller';
import { IpcBackUpAppDataArgs, ipcBackUpAppDataChannel, IpcBackUpAppDataRes, IpcRestoreAppDataArgs, ipcRestoreAppDataChannel, IpcRestoreAppDataRes } from '@common/ipc/channels';

type Deps = {
  backUpAppDataUseCase: BackUpAppDataUseCase;
  restoreAppDataUseCase: RestoreAppDataUseCase;
}

export function createAppDataBackupControllers({
  backUpAppDataUseCase,
  restoreAppDataUseCase,
}: Deps): [
    Controller<IpcBackUpAppDataArgs, IpcBackUpAppDataRes>,
    Controller<IpcRestoreAppDataArgs, IpcRestoreAppDataRes>,
  ] {
  return [{
    channel: ipcBackUpAppDataChannel,
    handle: async (event) => backUpAppDataUseCase(event.getSenderBrowserWindow())
  }, {
    channel: ipcRestoreAppDataChannel,
    handle: async (event) => restoreAppDataUseCase(event.getSenderBrowserWindow())
  }]
}
