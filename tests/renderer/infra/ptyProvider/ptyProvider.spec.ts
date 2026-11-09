/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createPtyProvider } from '@/infra/ptyProvider/ptyProvider';
import {
  ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyDataChannel, ipcPtyExitChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyTitleChannel, ipcPtyWriteChannel
} from '@common/ipc/channels';

jest.mock('@/infra/mainApi/mainApi');

const onMock = electronIpcRenderer.on as jest.Mock;
const invokeMock = electronIpcRenderer.invoke as jest.Mock;
const sendMock = electronIpcRenderer.send as jest.Mock;

function setup() {
  onMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  const provider = createPtyProvider();
  const listener = (channel: string) => onMock.mock.calls.find(c => c[0] === channel)?.[1] as (...args: unknown[]) => void;
  return { provider, data: listener(ipcPtyDataChannel), exit: listener(ipcPtyExitChannel), title: listener(ipcPtyTitleChannel) };
}

describe('PtyProvider', () => {
  it('invokes the pty channels', async () => {
    const { provider } = setup();
    invokeMock.mockResolvedValueOnce({ ok: true, terminalId: 't1' });
    await expect(provider.create({ cols: 80, rows: 24 })).resolves.toEqual({ ok: true, terminalId: 't1' });
    sendMock.mockReset();
    provider.write('t1', 'ls\r');
    expect(sendMock.mock.calls).toEqual([[ipcPtyWriteChannel, 't1', 'ls\r']]); // no answer to wait for
    provider.resize('t1', 100, 30);
    provider.kill('t1');
    provider.buffer('t1');
    expect(invokeMock.mock.calls).toEqual([
      [ipcPtyCreateChannel, { cols: 80, rows: 24 }],
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
    data('t1', 'hi', 1);
    data('t2', 'yo', 1);
    offA();
    data('t1', 'gone', 2);
    exit('t1', 3);
    expect(a.mock.calls).toEqual([['hi', 1]]);
    expect(b.mock.calls).toEqual([['yo', 1]]);
    expect(ended.mock.calls).toEqual([[3]]);
  });

  it('passes on the titles the shells set, for any terminal, until unsubscribed', () => {
    const { provider, title } = setup();
    const fn = jest.fn();
    const off = provider.onTitle(fn);
    title('t2', 'Claude Code');
    off();
    title('t2', 'later');
    expect(fn.mock.calls).toEqual([['t2', 'Claude Code']]);
  });
});
