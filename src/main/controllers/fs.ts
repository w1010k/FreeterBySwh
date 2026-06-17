/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcFsReadDirArgs, ipcFsReadDirChannel, IpcFsReadDirRes, IpcFsGetHomeDirArgs, ipcFsGetHomeDirChannel, IpcFsGetHomeDirRes, IpcFsGetImageDataUrlArgs, ipcFsGetImageDataUrlChannel, IpcFsGetImageDataUrlRes, IpcFsWriteTextFileArgs, ipcFsWriteTextFileChannel, IpcFsWriteTextFileRes } from '@common/ipc/channels';
import { ReadDirUseCase } from '@/application/useCases/fs/readDir';
import { GetHomeDirUseCase } from '@/application/useCases/fs/getHomeDir';
import { GetImageDataUrlUseCase } from '@/application/useCases/fs/getImageDataUrl';
import { WriteTextFileUseCase } from '@/application/useCases/fs/writeTextFile';

type Deps = {
  readDirUseCase: ReadDirUseCase;
  getHomeDirUseCase: GetHomeDirUseCase;
  getImageDataUrlUseCase: GetImageDataUrlUseCase;
  writeTextFileUseCase: WriteTextFileUseCase;
}

export function createFsControllers({
  readDirUseCase,
  getHomeDirUseCase,
  getImageDataUrlUseCase,
  writeTextFileUseCase,
}: Deps): [
    Controller<IpcFsReadDirArgs, IpcFsReadDirRes>,
    Controller<IpcFsGetHomeDirArgs, IpcFsGetHomeDirRes>,
    Controller<IpcFsGetImageDataUrlArgs, IpcFsGetImageDataUrlRes>,
    Controller<IpcFsWriteTextFileArgs, IpcFsWriteTextFileRes>,
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
    channel: ipcFsWriteTextFileChannel,
    handle: async (_event, path, text) => writeTextFileUseCase(path, text)
  }]
}
