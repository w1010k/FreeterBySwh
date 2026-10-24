import { createStateStorage } from '@common/data/stateStorage';
import { createInMemoryDataStorage } from '@common/infra/dataStorage/inMemoryDataStorage';

describe('state storage failures', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const makeStorage = (raw: ReturnType<typeof createInMemoryDataStorage>, onError = jest.fn()) =>
    createStateStorage(raw, 'app', 1, 5, () => ({}), (state: object) => state, undefined, onError);

  it('does not restart exhausted retries for runtime-only updates', async () => {
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const storage = createStateStorage(
      { ...createInMemoryDataStorage(), setText },
      'app',
      1,
      5000,
      () => ({ value: 1 }),
      (state: { value: number; title: string }) => ({ value: state.value })
    );
    storage.saveState({ value: 1, title: 'start' });
    for (let i = 0; i < 30; i++) {
      await jest.advanceTimersByTimeAsync(1000);
      storage.saveState({ value: 1, title: String(i) });
    }
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('automatically retries unchanged pending state, then stops timers and allows flush retry', async () => {
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const storage = makeStorage({ ...createInMemoryDataStorage(), setText });
    storage.saveState({ value: 1 });
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    setText.mockResolvedValue(undefined);
    storage.flush();
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(4);
  });

  it('preserves the newest state after failure without resaving runtime-only changes', async () => {
    const raw = createInMemoryDataStorage();
    const setText = jest.fn().mockRejectedValueOnce(new Error('full')).mockImplementation(raw.setText);
    const storage = makeStorage({ ...raw, setText });
    storage.saveState({ value: 1 });
    await jest.advanceTimersByTimeAsync(5);
    storage.saveState({ value: 1 });
    await jest.advanceTimersByTimeAsync(5);
    storage.saveState({ value: 2 });
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(2);
    expect(await raw.getText('app')).toContain('"value":2');
  });

  it('blocks default saves after an unreadable original, reports once, and permits a successful reload', async () => {
    const raw = createInMemoryDataStorage();
    const getText = jest.fn().mockRejectedValue(new Error('denied'));
    const setText = jest.fn(raw.setText);
    const onError = jest.fn();
    const storage = makeStorage({ ...raw, getText, setText }, onError);
    await expect(storage.loadState()).rejects.toThrow('denied');
    await expect(storage.loadState()).rejects.toThrow('denied');
    storage.saveState({ value: 'default' });
    storage.flush();
    await jest.runAllTimersAsync();
    expect(setText).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    getText.mockResolvedValue(undefined);
    await storage.loadState();
    storage.saveState({ value: 'new' });
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(1);
  });

  it('protects corrupt originals when the recovery backup cannot be written', async () => {
    const raw = createInMemoryDataStorage({ app: '{broken' });
    const setText = jest.fn().mockRejectedValue(new Error('full'));
    const storage = makeStorage({ ...raw, setText });
    await expect(storage.loadState()).rejects.toThrow('full');
    storage.saveState({ value: 'default' });
    storage.flush();
    await jest.runAllTimersAsync();
    expect(setText).toHaveBeenCalledTimes(1);
    expect(setText.mock.calls[0][0]).toMatch(/^app-corrupt-/);
    expect(await raw.getText('app')).toBe('{broken');
  });
});
