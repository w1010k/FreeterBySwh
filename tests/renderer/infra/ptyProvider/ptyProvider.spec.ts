/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createPtyProvider } from '@/infra/ptyProvider/ptyProvider';
import {
  ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyDataChannel, ipcPtyExitChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyWriteChannel
} from '@common/ipc/channels';

jest.mock('@/infra/mainApi/mainApi');

const onMock = electronIpcRenderer.on as jest.Mock;
const invokeMock = electronIpcRenderer.invoke as jest.Mock;

function setup() {
  onMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  const provider = createPtyProvider();
  const listener = (channel: string) => onMock.mock.calls.find(c => c[0] === channel)?.[1] as (...args: unknown[]) => void;
  return { provider, data: listener(ipcPtyDataChannel), exit: listener(ipcPtyExitChannel) };
}

describe('PtyProvider', () => {
  it('invokes the pty channels', async () => {
    const { provider } = setup();
    invokeMock.mockResolvedValueOnce({ ok: true, terminalId: 't1' });
    await expect(provider.create({ cols: 80, rows: 24 })).resolves.toEqual({ ok: true, terminalId: 't1' });
    provider.write('t1', 'ls\r');
    provider.resize('t1', 100, 30);
    provider.kill('t1');
    provider.buffer('t1');
    expect(invokeMock.mock.calls).toEqual([
      [ipcPtyCreateChannel, { cols: 80, rows: 24 }],
      [ipcPtyWriteChannel, 't1', 'ls\r'],
      [ipcPtyResizeChannel, 't1', 100, 30],
      [ipcPtyKillChannel, 't1'],
      [ipcPtyBufferChannel, 't1'],
    ]);
  });

  it('delivers output and exit to the subscribers of that terminal only, until they unsubscribe', () => {
    const { provider, data, exit } = setup();
    const a = jest.fn();
    const b = jest.fn();
    const ended = jest.fn();
    const offA = provider.onData('t1', a);
    provider.onData('t2', b);
    provider.onExit('t1', ended);
    data('t1', 'hi');
    data('t2', 'yo');
    offA();
    data('t1', 'gone');
    exit('t1', 3);
    expect(a.mock.calls).toEqual([['hi']]);
    expect(b.mock.calls).toEqual([['yo']]);
    expect(ended.mock.calls).toEqual([[3]]);
  });
});
