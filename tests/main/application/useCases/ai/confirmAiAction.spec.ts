/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createConfirmAiActionUseCase } from '@/application/useCases/ai/confirmAiAction';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise(r => jest.requireActual<typeof import('node:timers')>('node:timers').setImmediate(r));

describe('confirmAiActionUseCase', () => {
  afterEach(() => jest.useRealTimers());

  it('returns true when the box answers true', async () => {
    const confirm = createConfirmAiActionUseCase({ showWindow: jest.fn(), showConfirmBox: async () => true, timeoutMs: 1000 });
    await expect(confirm('cli', 'Do X')).resolves.toBe(true);
  });

  it('builds the message and shows the window before the box', async () => {
    const order: string[] = [];
    const showWindow = jest.fn(() => order.push('window'));
    const showConfirmBox = jest.fn(async () => {
      order.push('box');
      return false;
    });
    const confirm = createConfirmAiActionUseCase({ showWindow, showConfirmBox, timeoutMs: 1000 });
    await confirm('cli', 'Create workflow "X"');
    expect(showConfirmBox).toHaveBeenCalledWith('An AI agent (via cli) wants to: Create workflow "X"', expect.any(AbortSignal));
    expect(order).toEqual(['window', 'box']);
  });

  it('aborts the box and returns false after timeoutMs', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const showConfirmBox = jest.fn((_m: string, s: AbortSignal) => {
      signal = s;
      return new Promise<boolean>(resolve => s.addEventListener('abort', () => resolve(false)));
    });
    const confirm = createConfirmAiActionUseCase({ showWindow: jest.fn(), showConfirmBox, timeoutMs: 1000 });
    const p = confirm('mcp', 'X');
    await flush();
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  it('shows the second box only after the first settles', async () => {
    const first = deferred<boolean>();
    const showConfirmBox = jest.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async () => true);
    const confirm = createConfirmAiActionUseCase({ showWindow: jest.fn(), showConfirmBox, timeoutMs: 100000 });
    const p1 = confirm('cli', 'A');
    const p2 = confirm('cli', 'B');
    await flush();
    expect(showConfirmBox).toHaveBeenCalledTimes(1);
    first.resolve(false);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(true);
    expect(showConfirmBox).toHaveBeenCalledTimes(2);
  });

  it('counts the time limit from the request, so a queued confirm cannot outlive it', async () => {
    jest.useFakeTimers();
    const showConfirmBox = jest.fn((_m: string, s: AbortSignal) =>
      new Promise<boolean>(resolve => s.addEventListener('abort', () => resolve(false))));
    const confirm = createConfirmAiActionUseCase({ showWindow: jest.fn(), showConfirmBox, timeoutMs: 1000 });
    const p1 = confirm('cli', 'A');
    const p2 = confirm('cli', 'B');
    await flush();
    jest.advanceTimersByTime(1000);
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
    // B's time ran out while A was open, so B's box is never shown.
    expect(showConfirmBox).toHaveBeenCalledTimes(1);
  });

  it('treats a box that throws as a denial and keeps the queue going', async () => {
    const showConfirmBox = jest.fn()
      .mockImplementationOnce(async () => {
        throw new Error('no window');
      })
      .mockImplementationOnce(async () => true);
    const confirm = createConfirmAiActionUseCase({ showWindow: jest.fn(), showConfirmBox, timeoutMs: 1000 });
    await expect(confirm('cli', 'A')).resolves.toBe(false);
    await expect(confirm('cli', 'B')).resolves.toBe(true);
  });
});
