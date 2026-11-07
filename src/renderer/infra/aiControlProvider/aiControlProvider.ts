/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiControlProvider } from '@/application/interfaces/aiControlProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import {
  IpcAiActionResponseArgs,
  IpcAiActionResponseRes,
  IpcAiConfirmArgs,
  IpcAiConfirmRes,
  ipcAiActionResponseChannel,
  ipcAiConfirmChannel
} from '@common/ipc/channels';

export function createAiControlProvider(): AiControlProvider {
  return {
    confirm: (reqId, origin, describe) => electronIpcRenderer.invoke<IpcAiConfirmArgs, IpcAiConfirmRes>(ipcAiConfirmChannel, reqId, origin, describe),
    respond: (reqId, res) => electronIpcRenderer.invoke<IpcAiActionResponseArgs, IpcAiActionResponseRes>(ipcAiActionResponseChannel, reqId, res),
  }
}
