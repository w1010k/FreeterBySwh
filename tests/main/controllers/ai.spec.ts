/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  ipcAiActionResponseChannel,
  ipcAiAliveChannel,
  ipcAiConfirmChannel,
  ipcAiReadyChannel
} from '@common/ipc/channels';
import { createAiControllers } from '@/controllers/ai';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

function setup() {
  const confirmSignal = new AbortController().signal;
  const signalFor = jest.fn((_id: number): AbortSignal | undefined => confirmSignal);
  const aiActionBridge = { request: jest.fn(), resolve: jest.fn(), signalFor, setReady: jest.fn() };
  const confirmAiActionUseCase = jest.fn(async () => true);
  const [responseController, confirmController, readyController, aliveController] = createAiControllers({ aiActionBridge, confirmAiActionUseCase });
  return { confirmSignal, aiActionBridge, confirmAiActionUseCase, responseController, confirmController, readyController, aliveController };
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

  it('answers whether a request is still wanted (not cancelled, not timed out)', async () => {
    const { aiActionBridge, aliveController } = setup();
    const live = new AbortController();
    const cancelled = new AbortController();
    cancelled.abort();
    aiActionBridge.signalFor.mockImplementation((id: number) => ({ 1: live.signal, 3: cancelled.signal } as Record<number, AbortSignal>)[id]);
    expect(aliveController.channel).toBe(ipcAiAliveChannel);
    await expect(aliveController.handle(fixtureIpcMainEvent(), 1)).resolves.toBe(true);
    await expect(aliveController.handle(fixtureIpcMainEvent(), 2)).resolves.toBe(false);
    await expect(aliveController.handle(fixtureIpcMainEvent(), 3)).resolves.toBe(false);
  });
});
