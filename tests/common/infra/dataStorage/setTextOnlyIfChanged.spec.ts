/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createInMemoryDataStorage } from '@common/infra/dataStorage/inMemoryDataStorage';
import { setTextOnlyIfChanged } from '@common/infra/dataStorage/setTextOnlyIfChanged';

describe('setTextOnlyIfChanged', () => {
  it('retries the same value after a failed write', async () => {
    const setText = jest.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const storage = setTextOnlyIfChanged({ ...createInMemoryDataStorage(), setText });
    await expect(storage.setText('key', 'value')).rejects.toThrow('disk full');
    await storage.setText('key', 'value');
    expect(setText).toHaveBeenCalledTimes(2);
  });

  it('does not cache a read that started before a newer write', async () => {
    let resolveRead!: (text: string) => void;
    const getText = jest.fn((_key: string) => new Promise<string>(resolve => { resolveRead = resolve; }));
    const setText = jest.fn().mockResolvedValue(undefined);
    const storage = setTextOnlyIfChanged({ ...createInMemoryDataStorage(), getText, setText });
    const read = storage.getText('key');
    await storage.setText('key', 'new');
    resolveRead('old');
    await read;
    await storage.setText('key', 'old');
    expect(setText).toHaveBeenCalledTimes(2);
  });

  it('does not skip reverting to the old value while another write is pending', async () => {
    let finishWrite!: () => void;
    const setText = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishWrite = resolve; }))
      .mockResolvedValue(undefined);
    const storage = setTextOnlyIfChanged({ ...createInMemoryDataStorage({ key: 'old' }), setText });
    await storage.getText('key');
    const write = storage.setText('key', 'new');
    await storage.setText('key', 'old');
    finishWrite();
    await write;
    await storage.setText('key', 'new');
    expect(setText.mock.calls.map(call => call[1])).toEqual(['new', 'old', 'new']);
  });

  it('does not restore cache entries from a read completing after clear', async () => {
    let finishRead!: (text: string) => void;
    const getText = jest.fn((_key: string) => new Promise<string>(resolve => { finishRead = resolve; }));
    const setText = jest.fn().mockResolvedValue(undefined);
    const storage = setTextOnlyIfChanged({ ...createInMemoryDataStorage(), getText, setText });
    const read = storage.getText('key');
    await storage.clear();
    finishRead('old');
    await read;
    await storage.setText('key', 'old');
    expect(setText).toHaveBeenCalledWith('key', 'old');
  });
  describe('getText', () => {
    it('should call DataStorage.getText with right params and return a right value', async () => {
      const key = 'key';
      const value = 'value';
      const getText = jest.fn().mockResolvedValue(value);
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({}),
        getText
      });

      const gotText = await dataStorage.getText(key);

      expect(getText).toHaveBeenCalled();
      expect(getText).toHaveBeenCalledWith(key);
      expect(gotText).toEqual(value);
    })

    it('should remember a returned text as a prev state', async () => {
      const key = 'key';
      const value = 'value';
      const setText = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        setText
      });

      await dataStorage.getText(key);
      await dataStorage.setText(key, value);

      expect(setText).not.toHaveBeenCalled();
    })
  })

  describe('setText', () => {
    it('should call DataStorage.setText, if a prev state is empty', async () => {
      const key = 'key';
      const value = 'value';
      const setText = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        setText
      });

      await dataStorage.setText(key, value);

      expect(setText).toHaveBeenCalled();
    })

    it('should remember a new text as a prev state and prevent setText calls for the same text', async () => {
      const key = 'key';
      const value = 'value';
      const setText = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        setText
      });

      await dataStorage.setText(key, value);

      expect(setText).toHaveBeenCalledTimes(1);

      await dataStorage.setText(key, value);

      expect(setText).toHaveBeenCalledTimes(1);
    })

    it('should call DataStorage.setText with right params', async () => {
      const key = 'key';
      const value = 'value';
      const setText = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        setText
      });

      await dataStorage.setText(key, value);

      expect(setText).toHaveBeenCalledWith(key, value);
    })
  })

  describe('deleteItem', () => {
    it('should call DataStorage.deleteItem with right params', async () => {
      const key = 'key';
      const value = 'value';
      const deleteItem = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        deleteItem
      });

      await dataStorage.deleteItem(key);

      expect(deleteItem).toHaveBeenCalledWith(key);
    })

    it('should reset a prev state', async () => {
      const key = 'key';
      const value = 'value';
      const setText = jest.fn();
      const dataStorage = setTextOnlyIfChanged({
        ...createInMemoryDataStorage({ [key]: value }),
        setText
      });

      await dataStorage.setText(key, value);
      await dataStorage.deleteItem(key);
      await dataStorage.setText(key, value);

      expect(setText).toHaveBeenCalledTimes(2);
    })
  })
})
