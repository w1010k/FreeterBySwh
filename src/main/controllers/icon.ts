/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import {
  IpcGetFaviconArgs,
  ipcGetFaviconChannel,
  IpcGetFaviconRes,
  IpcGetFileIconArgs,
  ipcGetFileIconChannel,
  IpcGetFileIconRes
} from '@common/ipc/channels';
import { GetFileIconUseCase } from '@/application/useCases/icon/getFileIcon';
import { GetFaviconUseCase } from '@/application/useCases/icon/getFavicon';

type Deps = {
  getFileIconUseCase: GetFileIconUseCase;
  getFaviconUseCase: GetFaviconUseCase;
}

export function createIconControllers({
  getFileIconUseCase,
  getFaviconUseCase,
}: Deps): [
    Controller<IpcGetFileIconArgs, IpcGetFileIconRes>,
    Controller<IpcGetFaviconArgs, IpcGetFaviconRes>,
  ] {
  return [{
    channel: ipcGetFileIconChannel,
    handle: async (_event, path, bypassCache) => getFileIconUseCase(path, bypassCache)
  }, {
    channel: ipcGetFaviconChannel,
    handle: async (_event, url, bypassCache) => getFaviconUseCase(url, bypassCache)
  }]
}
