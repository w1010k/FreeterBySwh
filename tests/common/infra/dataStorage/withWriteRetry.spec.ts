import { createInMemoryDataStorage } from '@common/infra/dataStorage/inMemoryDataStorage';
import { withWriteRetry } from '@common/infra/dataStorage/withWriteRetry';
import { withJson } from '@common/infra/dataStorage/withJson';
import { setTextOnlyIfChanged } from '@common/infra/dataStorage/setTextOnlyIfChanged';

describe('withWriteRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('blocks a copy when another key becomes pending during its flush', async () => {
    let finish!: () => void;
    const setText = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }))
      .mockRejectedValue(new Error('full'));
    const storage = withWriteRetry({ ...createInMemoryDataStorage(), setText }, jest.fn());
    void storage.setText('sheet', 'new sheet');
    const flushed = storage.flushWritesOnce();
    void storage.setText('widths', 'new widths');
    finish();
    expect(await flushed).toBe(false);
    await storage.clear();
  });

  it('retains failed data, limits timers, and resumes on flush', async () => {
    const raw = createInMemoryDataStorage();
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const onError = jest.fn();
    const storage = withWriteRetry({ ...raw, setText }, onError);
    const done = storage.setText('key', 'pending');
    expect(setText).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    expect(await storage.getText('key')).toBe('pending');
    expect(onError).toHaveBeenCalledTimes(1);
    setText.mockImplementation(raw.setText);
    storage.flushWrites();
    await done;
    expect(await raw.getText('key')).toBe('pending');
  });

  it('serializes newer saves behind a failed in-flight write and never retries stale data', async () => {
    const raw = createInMemoryDataStorage();
    let fail!: (error: Error) => void;
    const setText = jest.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }))
      .mockImplementation(raw.setText);
    const storage = withWriteRetry({ ...raw, setText }, jest.fn());
    const first = storage.setText('key', 'old');
    const latest = storage.setText('key', 'new');
    expect(await storage.getText('key')).toBe('new');
    expect(setText).toHaveBeenCalledTimes(1);
    fail(new Error('full'));
    await Promise.all([first, latest]);
    await jest.runAllTimersAsync();
    expect(setText.mock.calls.map(call => call[1])).toEqual(['old', 'new']);
    expect(await raw.getText('key')).toBe('new');
  });

  it.each(['deleteItem', 'clear'] as const)('settles pending promises and cancels retries on %s', async operation => {
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const storage = withWriteRetry({ ...createInMemoryDataStorage(), setText }, jest.fn());
    const done = storage.setText('key', 'pending');
    await jest.advanceTimersByTimeAsync(0);
    if (operation === 'clear') {
      await storage.clear();
    } else {
      await storage.deleteItem('key');
    }
    await done;
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(1);
    expect(await storage.getText('key')).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not resurrect an in-flight failure after clear', async () => {
    let fail!: (error: Error) => void;
    const setText = jest.fn(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    const storage = withWriteRetry({ ...createInMemoryDataStorage(), setText }, jest.fn());
    const done = storage.setText('key', 'old');
    await storage.clear();
    await done;
    fail(new Error('full'));
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('routes JSON writes through retry and calls the adapter before the next read', async () => {
    const raw = createInMemoryDataStorage();
    const setText = jest.fn(raw.setText);
    const storage = withJson(withWriteRetry(setTextOnlyIfChanged({ ...raw, setText }), jest.fn()));
    const done = storage.setJson('key', { value: 1 });
    expect(setText).toHaveBeenCalledWith('key', '{"value":1}');
    expect(await storage.getJson('key')).toEqual({ value: 1 });
    await done;
    await storage.setJson('key', { value: 1 });
    expect(setText).toHaveBeenCalledTimes(1);
  });

  it('observes synchronous adapter failures and retries without rejecting fire-and-forget saves', async () => {
    const raw = createInMemoryDataStorage();
    const setText = jest.fn().mockImplementationOnce(() => { throw new Error('offline'); }).mockImplementation(raw.setText);
    const onError = jest.fn();
    const storage = withWriteRetry({ ...raw, setText }, onError);
    const done = storage.setText('key', 'value');
    await jest.runAllTimersAsync();
    await done;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await raw.getText('key')).toBe('value');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports failed pending persistence to copy callers without waiting for exhausted retries', async () => {
    const raw = createInMemoryDataStorage({ key: 'old' });
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const storage = withWriteRetry({ ...raw, setText }, jest.fn());
    const done = storage.setText('key', 'new');
    expect(await storage.flushWritesOnce()).toBe(false);
    expect(await raw.getText('key')).toBe('old');
    expect(await storage.getText('key')).toBe('new');
    setText.mockImplementation(raw.setText);
    expect(await storage.flushWritesOnce()).toBe(true);
    await done;
    expect(await raw.getText('key')).toBe('new');
    expect(jest.getTimerCount()).toBe(0);
  });
});
