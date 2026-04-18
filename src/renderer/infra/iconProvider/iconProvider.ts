/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  IpcGetFaviconArgs,
  ipcGetFaviconChannel,
  IpcGetFaviconRes,
  IpcGetFileIconArgs,
  ipcGetFileIconChannel,
  IpcGetFileIconRes
} from '@common/ipc/channels';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { IconProvider } from '@/application/interfaces/iconProvider';

export function createIconProvider(): IconProvider {
  return {
    getFileIcon: (path, bypassCache) => electronIpcRenderer.invoke<IpcGetFileIconArgs, IpcGetFileIconRes>(
      ipcGetFileIconChannel,
      path,
      bypassCache
    ),
    getFavicon: (url, bypassCache) => electronIpcRenderer.invoke<IpcGetFaviconArgs, IpcGetFaviconRes>(
      ipcGetFaviconChannel,
      url,
      bypassCache
    ),
  }
}
