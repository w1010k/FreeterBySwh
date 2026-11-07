/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { AiActionBridge } from '@/application/ai/aiActionBridge';
import { AiAgentRunner } from '@/application/ai/aiAgentRunner';
import { ConfirmAiActionUseCase } from '@/application/useCases/ai/confirmAiAction';
import {
  IpcAiActionResponseArgs,
  IpcAiActionResponseRes,
  IpcAiAgentCancelArgs,
  IpcAiAgentCancelRes,
  IpcAiAgentDetectArgs,
  IpcAiAgentDetectRes,
  IpcAiAgentSendArgs,
  IpcAiAgentSendRes,
  IpcAiConfirmArgs,
  IpcAiConfirmRes,
  IpcAiReadyArgs,
  IpcAiReadyRes,
  ipcAiActionResponseChannel,
  ipcAiAgentCancelChannel,
  ipcAiAgentDetectChannel,
  ipcAiAgentSendChannel,
  ipcAiConfirmChannel,
  ipcAiReadyChannel
} from '@common/ipc/channels';

type Deps = {
  aiActionBridge: AiActionBridge;
  confirmAiActionUseCase: ConfirmAiActionUseCase;
  aiAgentRunner: Pick<AiAgentRunner, 'detect' | 'send' | 'cancel'>;
}

export function createAiControllers({
  aiActionBridge,
  confirmAiActionUseCase,
  aiAgentRunner,
}: Deps): [
    Controller<IpcAiActionResponseArgs, IpcAiActionResponseRes>,
    Controller<IpcAiConfirmArgs, IpcAiConfirmRes>,
    Controller<IpcAiAgentDetectArgs, IpcAiAgentDetectRes>,
    Controller<IpcAiAgentSendArgs, IpcAiAgentSendRes>,
    Controller<IpcAiAgentCancelArgs, IpcAiAgentCancelRes>,
    Controller<IpcAiReadyArgs, IpcAiReadyRes>,
  ] {
  return [{
    channel: ipcAiActionResponseChannel,
    handle: async (_event, reqId, res) => aiActionBridge.resolve(reqId, res)
  }, {
    channel: ipcAiConfirmChannel,
    handle: async (_event, reqId, origin, describe) => confirmAiActionUseCase(origin, describe, aiActionBridge.signalFor(reqId))
  }, {
    channel: ipcAiAgentDetectChannel,
    handle: async () => aiAgentRunner.detect()
  }, {
    channel: ipcAiAgentSendChannel,
    handle: async (_event, conversationId, req) => aiAgentRunner.send(conversationId, req)
  }, {
    channel: ipcAiAgentCancelChannel,
    handle: async (_event, conversationId) => aiAgentRunner.cancel(conversationId)
  }, {
    channel: ipcAiReadyChannel,
    handle: async () => aiActionBridge.setReady(true)
  }]
}
