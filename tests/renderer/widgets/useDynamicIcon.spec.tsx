/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, renderHook } from '@testing-library/react';
import { useDynamicIcon } from '@/widgets/useDynamicIcon';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('useDynamicIcon', () => {
  it('fetches on mount with the initial key and exposes the data URI', async () => {
    const fetchFn = jest.fn(async () => 'data:image/png;base64,AAA');
    const { result } = renderHook(() => useDynamicIcon(fetchFn, 'https://x.com'));

    expect(result.current.icon).toBeNull();
    expect(fetchFn).toHaveBeenCalledWith('https://x.com');

    await act(async () => { await Promise.resolve(); });

    expect(result.current.icon).toBe('data:image/png;base64,AAA');
  });

  it('does not fetch when key is empty and keeps icon null', () => {
    const fetchFn = jest.fn(async () => 'data:image/png;base64,AAA');
    const { result } = renderHook(() => useDynamicIcon(fetchFn, ''));

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.current.icon).toBeNull();
  });

  it('refetches and resets icon when key changes', async () => {
    const fetchFn = jest.fn(async (k: string) => `data:image/png;base64,${k}`);
    const { result, rerender } = renderHook(({ k }) => useDynamicIcon(fetchFn, k), {
      initialProps: { k: 'a' }
    });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.icon).toBe('data:image/png;base64,a');

    rerender({ k: 'b' });
    expect(result.current.icon).toBeNull();

    await act(async () => { await Promise.resolve(); });
    expect(result.current.icon).toBe('data:image/png;base64,b');
    expect(fetchFn).toHaveBeenNthCalledWith(1, 'a');
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'b');
  });

  it('cancels a pending fetch when the key changes before it resolves', async () => {
    const d1 = deferred<string | null>();
    const d2 = deferred<string | null>();
    const fetchFn = jest.fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);

    const { result, rerender } = renderHook(({ k }) => useDynamicIcon(fetchFn, k), {
      initialProps: { k: 'a' }
    });

    rerender({ k: 'b' });
    // Resolve the first (now-cancelled) fetch last — its result must not leak.
    await act(async () => {
      d2.resolve('data:image/png;base64,b');
      d1.resolve('data:image/png;base64,a');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.icon).toBe('data:image/png;base64,b');
  });

  it('retryIfMissing is a no-op when an icon is already loaded', async () => {
    const fetchFn = jest.fn(async () => 'data:image/png;base64,AAA');
    const { result } = renderHook(() => useDynamicIcon(fetchFn, 'https://x.com'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.icon).toBe('data:image/png;base64,AAA');
    fetchFn.mockClear();

    act(() => result.current.retryIfMissing());

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('retryIfMissing is a no-op for an empty key', () => {
    const fetchFn = jest.fn(async () => 'data:image/png;base64,AAA');
    const { result } = renderHook(() => useDynamicIcon(fetchFn, ''));

    act(() => result.current.retryIfMissing());

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('retryIfMissing bypasses cache when initial fetch failed', async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('data:image/png;base64,RETRY');

    const { result } = renderHook(() => useDynamicIcon(fetchFn, 'https://x.com'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.icon).toBeNull();

    await act(async () => {
      result.current.retryIfMissing();
      await Promise.resolve();
    });

    expect(fetchFn).toHaveBeenNthCalledWith(1, 'https://x.com');
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://x.com', true);
    expect(result.current.icon).toBe('data:image/png;base64,RETRY');
  });

  it('retryIfMissing never overwrites with a stale key result', async () => {
    const d1 = deferred<string | null>();
    const retryA = deferred<string | null>();
    const bNeverResolves = deferred<string | null>();
    // Call order: #1 initial 'a', #2 bypass retry for 'a', #3 initial 'b'.
    const fetchFn = jest.fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(retryA.promise)
      .mockReturnValueOnce(bNeverResolves.promise);

    const { result, rerender } = renderHook(({ k }) => useDynamicIcon(fetchFn, k), {
      initialProps: { k: 'a' }
    });
    await act(async () => { d1.resolve(null); await Promise.resolve(); });
    expect(result.current.icon).toBeNull();

    act(() => { result.current.retryIfMissing(); });
    rerender({ k: 'b' });
    await act(async () => {
      retryA.resolve('data:image/png;base64,STALE_A');
      await Promise.resolve();
      await Promise.resolve();
    });

    // The stale 'a' retry must not paint onto the 'b' widget; 'b' fetch is
    // still pending so icon stays null.
    expect(result.current.icon).toBeNull();
    expect(fetchFn).toHaveBeenNthCalledWith(1, 'a');
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'a', true);
    expect(fetchFn).toHaveBeenNthCalledWith(3, 'b');
  });

  it('retryIfMissing tolerates rejection without throwing', async () => {
    const fetchFn = jest.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('net'));

    const { result } = renderHook(() => useDynamicIcon(fetchFn, 'https://x.com'));
    await act(async () => { await Promise.resolve(); });

    await expect(
      act(async () => { result.current.retryIfMissing(); await Promise.resolve(); })
    ).resolves.not.toThrow();
    expect(result.current.icon).toBeNull();
  });
});
