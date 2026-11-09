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
  IpcAiReadyArgs,
  IpcAiAliveArgs,
  IpcAiAliveRes,
  IpcAiReadyRes,
  ipcAiActionResponseChannel,
  ipcAiConfirmChannel,
  ipcAiReadyChannel,
  ipcAiAliveChannel
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
    Controller<IpcAiReadyArgs, IpcAiReadyRes>,
    Controller<IpcAiAliveArgs, IpcAiAliveRes>,
  ] {
  return [{
    channel: ipcAiActionResponseChannel,
    handle: async (_event, reqId, res) => aiActionBridge.resolve(reqId, res)
  }, {
    channel: ipcAiConfirmChannel,
    handle: async (_event, reqId, origin, describe) => confirmAiActionUseCase(origin, describe, aiActionBridge.signalFor(reqId))
  }, {
    channel: ipcAiReadyChannel,
    handle: async () => aiActionBridge.setReady(true)
  }, {
    channel: ipcAiAliveChannel,
    handle: async (_event, reqId) => {
      const signal = aiActionBridge.signalFor(reqId);
      return !!signal && !signal.aborted;
    }
  }]
}
