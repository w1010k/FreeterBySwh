/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppDataBackupProvider } from '@/application/interfaces/appDataBackupProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { IpcBackUpAppDataArgs, ipcBackUpAppDataChannel, IpcBackUpAppDataRes, IpcRestoreAppDataArgs, ipcRestoreAppDataChannel, IpcRestoreAppDataRes } from '@common/ipc/channels';

export function createAppDataBackupProvider(): AppDataBackupProvider {
  return {
    backUp: () => electronIpcRenderer.invoke<IpcBackUpAppDataArgs, IpcBackUpAppDataRes>(ipcBackUpAppDataChannel),
    restore: () => electronIpcRenderer.invoke<IpcRestoreAppDataArgs, IpcRestoreAppDataRes>(ipcRestoreAppDataChannel),
  };
}
