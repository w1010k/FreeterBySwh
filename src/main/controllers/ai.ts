/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { AiActionBridge } from '@/application/ai/aiActionBridge';
import { ConfirmAiActionUseCase } from '@/application/useCases/ai/confirmAiAction';
import {
  IpcAiActionResponseArgs,
  IpcAiActionResponseRes,
  IpcAiConfirmArgs,
  IpcAiConfirmRes,
  ipcAiActionResponseChannel,
  ipcAiConfirmChannel
} from '@common/ipc/channels';

type Deps = {
  aiActionBridge: AiActionBridge;
  confirmAiActionUseCase: ConfirmAiActionUseCase;
}

export function createAiControllers({
  aiActionBridge,
  confirmAiActionUseCase,
}: Deps): [
    Controller<IpcAiActionResponseArgs, IpcAiActionResponseRes>,
    Controller<IpcAiConfirmArgs, IpcAiConfirmRes>,
  ] {
  return [{
    channel: ipcAiActionResponseChannel,
    handle: async (_event, reqId, res) => aiActionBridge.resolve(reqId, res)
  }, {
    channel: ipcAiConfirmChannel,
    handle: async (_event, origin, describe) => confirmAiActionUseCase(origin, describe)
  }]
}
