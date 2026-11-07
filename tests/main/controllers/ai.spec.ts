/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcAiActionResponseChannel, ipcAiConfirmChannel } from '@common/ipc/channels';
import { createAiControllers } from '@/controllers/ai';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

function setup() {
  const aiActionBridge = { request: jest.fn(), resolve: jest.fn() };
  const confirmAiActionUseCase = jest.fn(async () => true);
  const [responseController, confirmController] = createAiControllers({ aiActionBridge, confirmAiActionUseCase });
  return { aiActionBridge, confirmAiActionUseCase, responseController, confirmController };
}

describe('AiControllers', () => {
  it('passes ai-action-response to the bridge', async () => {
    const { aiActionBridge, responseController } = setup();
    expect(responseController.channel).toBe(ipcAiActionResponseChannel);
    await responseController.handle(fixtureIpcMainEvent(), 3, { ok: true, value: 1 });
    expect(aiActionBridge.resolve).toHaveBeenCalledWith(3, { ok: true, value: 1 });
  });

  it('passes ai-confirm to the confirm use case and returns its answer', async () => {
    const { confirmAiActionUseCase, confirmController } = setup();
    expect(confirmController.channel).toBe(ipcAiConfirmChannel);
    await expect(confirmController.handle(fixtureIpcMainEvent(), 'mcp', 'Do X')).resolves.toBe(true);
    expect(confirmAiActionUseCase).toHaveBeenCalledWith('mcp', 'Do X');
  });
});
