/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcSetDownloadDirArgs, IpcSetDownloadDirRes, ipcSetDownloadDirChannel } from '@common/ipc/channels';
import { DownloadProvider } from '@/application/interfaces/downloadProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';

export function createDownloadProvider(): DownloadProvider {
  return {
    setDownloadDir: async (dir) => electronIpcRenderer.invoke<IpcSetDownloadDirArgs, IpcSetDownloadDirRes>(
      ipcSetDownloadDirChannel,
      dir
    )
  }
}
