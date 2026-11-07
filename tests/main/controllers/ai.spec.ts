/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  ipcAiActionResponseChannel,
  ipcAiAgentCancelChannel,
  ipcAiAgentDetectChannel,
  ipcAiAgentSendChannel,
  ipcAiConfirmChannel,
  ipcAiReadyChannel
} from '@common/ipc/channels';
import { createAiControllers } from '@/controllers/ai';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

function setup() {
  const confirmSignal = new AbortController().signal;
  const aiActionBridge = { request: jest.fn(), resolve: jest.fn(), signalFor: jest.fn(() => confirmSignal), setReady: jest.fn() };
  const confirmAiActionUseCase = jest.fn(async () => true);
  const aiAgentRunner = {
    detect: jest.fn(() => ({ claude: true, codex: false })),
    send: jest.fn(() => ({ ok: true as const, conversationId: 'c1' })),
    cancel: jest.fn(),
    stopAll: jest.fn(),
  };
  const [responseController, confirmController, detectController, sendController, cancelController, readyController] =
    createAiControllers({ aiActionBridge, confirmAiActionUseCase, aiAgentRunner });
  return {
    confirmSignal, aiActionBridge, confirmAiActionUseCase, aiAgentRunner,
    responseController, confirmController, detectController, sendController, cancelController, readyController
  };
}

describe('AiControllers', () => {
  it('passes ai-action-response to the bridge', async () => {
    const { aiActionBridge, responseController } = setup();
    expect(responseController.channel).toBe(ipcAiActionResponseChannel);
    await responseController.handle(fixtureIpcMainEvent(), 3, { ok: true, value: 1 });
    expect(aiActionBridge.resolve).toHaveBeenCalledWith(3, { ok: true, value: 1 });
  });

  it('passes ai-confirm to the confirm use case and returns its answer', async () => {
    const { confirmAiActionUseCase, confirmController, confirmSignal, aiActionBridge } = setup();
    expect(confirmController.channel).toBe(ipcAiConfirmChannel);
    await expect(confirmController.handle(fixtureIpcMainEvent(), 4, 'mcp', 'Do X')).resolves.toBe(true);
    expect(aiActionBridge.signalFor).toHaveBeenCalledWith(4);
    expect(confirmAiActionUseCase).toHaveBeenCalledWith('mcp', 'Do X', confirmSignal);
  });

  it('marks the bridge ready when the app page says it listens', async () => {
    const { aiActionBridge, readyController } = setup();
    expect(readyController.channel).toBe(ipcAiReadyChannel);
    await readyController.handle(fixtureIpcMainEvent());
    expect(aiActionBridge.setReady).toHaveBeenCalledWith(true);
  });

  it('passes agent detect, send and cancel to the runner', async () => {
    const { aiAgentRunner, detectController, sendController, cancelController } = setup();
    expect([detectController.channel, sendController.channel, cancelController.channel])
      .toEqual([ipcAiAgentDetectChannel, ipcAiAgentSendChannel, ipcAiAgentCancelChannel]);
    await expect(detectController.handle(fixtureIpcMainEvent())).resolves.toEqual({ claude: true, codex: false });
    await expect(sendController.handle(fixtureIpcMainEvent(), null, { tool: 'claude', prompt: 'hi' })).resolves.toEqual({ ok: true, conversationId: 'c1' });
    expect(aiAgentRunner.send).toHaveBeenCalledWith(null, { tool: 'claude', prompt: 'hi' });
    await cancelController.handle(fixtureIpcMainEvent(), 'c1');
    expect(aiAgentRunner.cancel).toHaveBeenCalledWith('c1');
  });
});
