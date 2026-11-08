/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createAiAgentProvider } from '@/infra/aiAgentProvider/aiAgentProvider';
import {
  ipcAiAgentCancelChannel, ipcAiAgentDetectChannel, ipcAiAgentEndChannel, ipcAiAgentEventChannel, ipcAiAgentSendChannel, ipcAiAgentWarmChannel
} from '@common/ipc/channels';

jest.mock('@/infra/mainApi/mainApi');

const onMock = electronIpcRenderer.on as jest.Mock;
const invokeMock = electronIpcRenderer.invoke as jest.Mock;

function setup() {
  onMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  const provider = createAiAgentProvider();
  const event = onMock.mock.calls.find(c => c[0] === ipcAiAgentEventChannel)?.[1] as (...args: unknown[]) => void;
  return { provider, event };
}

describe('AiAgentProvider', () => {
  it('invokes the agent channels', async () => {
    const { provider } = setup();
    invokeMock.mockResolvedValueOnce({ claude: true, codex: false });
    invokeMock.mockResolvedValueOnce({ ok: true, conversationId: 'c1' });
    await expect(provider.detect()).resolves.toEqual({ claude: true, codex: false });
    await expect(provider.send(null, { tool: 'claude', prompt: 'hi' })).resolves.toEqual({ ok: true, conversationId: 'c1' });
    provider.cancel('c1');
    provider.warm(null, { tool: 'claude' });
    provider.end('c1');
    expect(invokeMock.mock.calls).toEqual([
      [ipcAiAgentDetectChannel],
      [ipcAiAgentSendChannel, null, { tool: 'claude', prompt: 'hi' }],
      [ipcAiAgentCancelChannel, 'c1'],
      [ipcAiAgentWarmChannel, null, { tool: 'claude' }],
      [ipcAiAgentEndChannel, 'c1'],
    ]);
  });

  it('keeps events that come before the page listens to that conversation, and gives them on subscribe', () => {
    const { provider, event } = setup();
    event('c9', { type: 'error', message: 'spawn failed' });
    const fn = jest.fn();
    provider.onEvent('c9', fn);
    expect(fn.mock.calls).toEqual([[{ type: 'error', message: 'spawn failed' }]]);
  });

  it('delivers events to the subscribers of that conversation only, until they unsubscribe', () => {
    const { provider, event } = setup();
    const a = jest.fn();
    const b = jest.fn();
    const offA = provider.onEvent('c1', a);
    provider.onEvent('c2', b);
    event('c1', { type: 'text', text: 'hi' });
    event('c2', { type: 'done' });
    event('c1', null);
    offA();
    event('c1', { type: 'done' });
    expect(a.mock.calls).toEqual([[{ type: 'text', text: 'hi' }]]);
    expect(b.mock.calls).toEqual([[{ type: 'done' }]]);
  });
});
