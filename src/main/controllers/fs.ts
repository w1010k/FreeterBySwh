/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcFsReadDirArgs, ipcFsReadDirChannel, IpcFsReadDirRes, IpcFsGetHomeDirArgs, ipcFsGetHomeDirChannel, IpcFsGetHomeDirRes, IpcFsGetImageDataUrlArgs, ipcFsGetImageDataUrlChannel, IpcFsGetImageDataUrlRes } from '@common/ipc/channels';
import { ReadDirUseCase } from '@/application/useCases/fs/readDir';
import { GetHomeDirUseCase } from '@/application/useCases/fs/getHomeDir';
import { GetImageDataUrlUseCase } from '@/application/useCases/fs/getImageDataUrl';

type Deps = {
  readDirUseCase: ReadDirUseCase;
  getHomeDirUseCase: GetHomeDirUseCase;
  getImageDataUrlUseCase: GetImageDataUrlUseCase;
}

export function createFsControllers({
  readDirUseCase,
  getHomeDirUseCase,
  getImageDataUrlUseCase,
}: Deps): [
    Controller<IpcFsReadDirArgs, IpcFsReadDirRes>,
    Controller<IpcFsGetHomeDirArgs, IpcFsGetHomeDirRes>,
    Controller<IpcFsGetImageDataUrlArgs, IpcFsGetImageDataUrlRes>,
  ] {
  return [{
    channel: ipcFsReadDirChannel,
    handle: async (_event, dirPath, opts) => readDirUseCase(dirPath, opts)
  }, {
    channel: ipcFsGetHomeDirChannel,
    handle: async () => getHomeDirUseCase()
  }, {
    channel: ipcFsGetImageDataUrlChannel,
    handle: async (_event, path) => getImageDataUrlUseCase(path)
  }]
}
