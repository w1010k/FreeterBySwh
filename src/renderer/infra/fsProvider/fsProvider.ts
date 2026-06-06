/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IpcFsReadDirArgs, ipcFsReadDirChannel, IpcFsReadDirRes, IpcFsGetHomeDirArgs, ipcFsGetHomeDirChannel, IpcFsGetHomeDirRes, IpcFsGetImageDataUrlArgs, ipcFsGetImageDataUrlChannel, IpcFsGetImageDataUrlRes } from '@common/ipc/channels';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { FsProvider } from '@/application/interfaces/fsProvider';

export function createFsProvider(): FsProvider {
  return {
    readDir: (dirPath, opts) => electronIpcRenderer.invoke<IpcFsReadDirArgs, IpcFsReadDirRes>(
      ipcFsReadDirChannel,
      dirPath,
      opts
    ),
    getHomeDir: () => electronIpcRenderer.invoke<IpcFsGetHomeDirArgs, IpcFsGetHomeDirRes>(
      ipcFsGetHomeDirChannel
    ),
    getImageDataUrl: (path) => electronIpcRenderer.invoke<IpcFsGetImageDataUrlArgs, IpcFsGetImageDataUrlRes>(
      ipcFsGetImageDataUrlChannel,
      path
    ),
  }
}
