/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcFsReadDirArgs, ipcFsReadDirChannel, IpcFsReadDirRes, IpcFsGetHomeDirArgs, ipcFsGetHomeDirChannel, IpcFsGetHomeDirRes, IpcFsGetImageDataUrlArgs, ipcFsGetImageDataUrlChannel, IpcFsGetImageDataUrlRes, IpcFsReadTextFileArgs, ipcFsReadTextFileChannel, IpcFsReadTextFileRes, IpcFsWriteTextFileArgs, ipcFsWriteTextFileChannel, IpcFsWriteTextFileRes, IpcFsGetMtimeArgs, ipcFsGetMtimeChannel, IpcFsGetMtimeRes } from '@common/ipc/channels';
import { ReadDirUseCase } from '@/application/useCases/fs/readDir';
import { GetHomeDirUseCase } from '@/application/useCases/fs/getHomeDir';
import { GetImageDataUrlUseCase } from '@/application/useCases/fs/getImageDataUrl';
import { ReadTextFileUseCase } from '@/application/useCases/fs/readTextFile';
import { WriteTextFileUseCase } from '@/application/useCases/fs/writeTextFile';
import { GetMtimeUseCase } from '@/application/useCases/fs/getMtime';

type Deps = {
  readDirUseCase: ReadDirUseCase;
  getHomeDirUseCase: GetHomeDirUseCase;
  getImageDataUrlUseCase: GetImageDataUrlUseCase;
  readTextFileUseCase: ReadTextFileUseCase;
  writeTextFileUseCase: WriteTextFileUseCase;
  getMtimeUseCase: GetMtimeUseCase;
}

export function createFsControllers({
  readDirUseCase,
  getHomeDirUseCase,
  getImageDataUrlUseCase,
  readTextFileUseCase,
  writeTextFileUseCase,
  getMtimeUseCase,
}: Deps): [
    Controller<IpcFsReadDirArgs, IpcFsReadDirRes>,
    Controller<IpcFsGetHomeDirArgs, IpcFsGetHomeDirRes>,
    Controller<IpcFsGetImageDataUrlArgs, IpcFsGetImageDataUrlRes>,
    Controller<IpcFsReadTextFileArgs, IpcFsReadTextFileRes>,
    Controller<IpcFsWriteTextFileArgs, IpcFsWriteTextFileRes>,
    Controller<IpcFsGetMtimeArgs, IpcFsGetMtimeRes>,
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
  }, {
    channel: ipcFsReadTextFileChannel,
    handle: async (_event, path) => readTextFileUseCase(path)
  }, {
    channel: ipcFsWriteTextFileChannel,
    handle: async (_event, path, text) => writeTextFileUseCase(path, text)
  }, {
    channel: ipcFsGetMtimeChannel,
    handle: async (_event, path) => getMtimeUseCase(path)
  }]
}
