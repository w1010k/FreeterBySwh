/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyShellsChannel, ipcPtyWriteChannel } from '@common/ipc/channels';
import { createPtyControllers, createPtyInputListener } from '@/controllers/pty';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

describe('PtyControllers', () => {
  it('passes create, write, resize, buffer and kill to the terminal host', async () => {
    const terminalHost = {
      create: jest.fn(() => ({ ok: true as const, terminalId: 't1' })),
      write: jest.fn(),
      resize: jest.fn(),
      buffer: jest.fn(async () => ({ screen: 'out', seq: 3 })),
      kill: jest.fn(),
      killAll: jest.fn(),
    };
    const shellList = [{ label: 'Command Prompt', shell: 'cmd.exe' }];
    const [create, resize, buffer, kill, shells] = createPtyControllers({ terminalHost, shells: () => shellList });
    expect([create.channel, resize.channel, buffer.channel, kill.channel, shells.channel])
      .toEqual([ipcPtyCreateChannel, ipcPtyResizeChannel, ipcPtyBufferChannel, ipcPtyKillChannel, ipcPtyShellsChannel]);
    const e = fixtureIpcMainEvent();
    await expect(create.handle(e, { cols: 80, rows: 24 })).resolves.toEqual({ ok: true, terminalId: 't1' });
    const input = createPtyInputListener({ terminalHost });
    expect(input.channel).toBe(ipcPtyWriteChannel);
    input.listener(e, 't1', 'ls\r');
    input.listener(e, 't1', 5); // not text: ignored
    await resize.handle(e, 't1', 100, 30);
    await expect(buffer.handle(e, 't1')).resolves.toEqual({ screen: 'out', seq: 3 });
    await kill.handle(e, 't1');
    await expect(shells.handle(e)).resolves.toEqual(shellList);
    expect(terminalHost.write).toHaveBeenCalledTimes(1);
    expect(terminalHost.write).toHaveBeenCalledWith('t1', 'ls\r');
    expect(terminalHost.resize).toHaveBeenCalledWith('t1', 100, 30);
    expect(terminalHost.kill).toHaveBeenCalledWith('t1');
  });
});
