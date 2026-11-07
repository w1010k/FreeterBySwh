/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createAiActionBridge } from '@/application/ai/aiActionBridge';
import { AiRpcRequest } from '@common/ai/protocol';

const req: AiRpcRequest = { jsonrpc: '2.0', id: 1, method: 'actions.list', params: { token: 't', origin: 'cli' } };

/** A bridge whose app page has said it listens. */
function readyBridge(deps: Parameters<typeof createAiActionBridge>[0]) {
  const bridge = createAiActionBridge(deps);
  bridge.setReady(true);
  return bridge;
}

describe('createAiActionBridge', () => {
  it('answers not_ready at once while the app page is not listening (starting or reloading)', async () => {
    const send = jest.fn();
    const bridge = createAiActionBridge({ send, timeoutMs: 1000 });
    await expect(bridge.request(req)).resolves.toMatchObject({ ok: false, code: 'not_ready' });
    bridge.setReady(true);
    bridge.request(req);
    bridge.setReady(false);
    await expect(bridge.request(req)).resolves.toMatchObject({ ok: false, code: 'not_ready' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends the request and resolves when resolve is called with its reqId', async () => {
    const send = jest.fn();
    const bridge = readyBridge({ send, timeoutMs: 1000 });
    const p = bridge.request(req);
    expect(send).toHaveBeenCalledWith(expect.any(Number), req);
    const reqId = send.mock.calls[0][0];
    bridge.resolve(reqId, { ok: true, value: 'v' });
    await expect(p).resolves.toEqual({ ok: true, value: 'v' });
  });

  it('gives each request its own reqId', () => {
    const send = jest.fn();
    const bridge = readyBridge({ send, timeoutMs: 1000 });
    bridge.request(req);
    bridge.request(req);
    expect(send.mock.calls[0][0]).not.toBe(send.mock.calls[1][0]);
  });

  it('returns timeout after timeoutMs', async () => {
    const bridge = readyBridge({ send: jest.fn(), timeoutMs: 1000 });
    const p = bridge.request(req);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });

  it('ignores resolve for an unknown or already timed-out reqId', async () => {
    const send = jest.fn();
    const bridge = readyBridge({ send, timeoutMs: 1000 });
    const p = bridge.request(req);
    jest.advanceTimersByTime(1000);
    expect(() => bridge.resolve(send.mock.calls[0][0], { ok: true, value: 1 })).not.toThrow();
    expect(() => bridge.resolve(999, { ok: true, value: 1 })).not.toThrow();
    await expect(p).resolves.toMatchObject({ code: 'timeout' });
  });

  it('ends a request whose caller went away, and aborts its confirm box', async () => {
    const send = jest.fn();
    const bridge = readyBridge({ send, timeoutMs: 1000 });
    const caller = new AbortController();
    const p = bridge.request(req, caller.signal);
    const reqId = send.mock.calls[0][0];
    const confirmSignal = bridge.signalFor(reqId);
    expect(confirmSignal?.aborted).toBe(false);
    caller.abort();
    await expect(p).resolves.toMatchObject({ ok: false, code: 'failed' });
    expect(confirmSignal?.aborted).toBe(true);
  });

  it('aborts the confirm box when the request times out', async () => {
    const send = jest.fn();
    const bridge = readyBridge({ send, timeoutMs: 1000 });
    bridge.request(req);
    const confirmSignal = bridge.signalFor(send.mock.calls[0][0]);
    jest.advanceTimersByTime(1000);
    expect(confirmSignal?.aborted).toBe(true);
  });
});
