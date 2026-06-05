/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcFsReadDirArgs, ipcFsReadDirChannel, IpcFsReadDirRes, IpcFsGetHomeDirArgs, ipcFsGetHomeDirChannel, IpcFsGetHomeDirRes } from '@common/ipc/channels';
import { ReadDirUseCase } from '@/application/useCases/fs/readDir';
import { GetHomeDirUseCase } from '@/application/useCases/fs/getHomeDir';

type Deps = {
  readDirUseCase: ReadDirUseCase;
  getHomeDirUseCase: GetHomeDirUseCase;
}

export function createFsControllers({
  readDirUseCase,
  getHomeDirUseCase,
}: Deps): [
    Controller<IpcFsReadDirArgs, IpcFsReadDirRes>,
    Controller<IpcFsGetHomeDirArgs, IpcFsGetHomeDirRes>,
  ] {
  return [{
    channel: ipcFsReadDirChannel,
    handle: async (_event, dirPath, opts) => readDirUseCase(dirPath, opts)
  }, {
    channel: ipcFsGetHomeDirChannel,
    handle: async () => getHomeDirUseCase()
  }]
}
