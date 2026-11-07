/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyWriteChannel } from '@common/ipc/channels';
import { createPtyControllers } from '@/controllers/pty';
import { fixtureIpcMainEvent } from '@tests/infra/mocks/ipcMain';

describe('PtyControllers', () => {
  it('passes create, write, resize, buffer and kill to the terminal host', async () => {
    const terminalHost = {
      create: jest.fn(() => ({ ok: true as const, terminalId: 't1' })),
      write: jest.fn(),
      resize: jest.fn(),
      buffer: jest.fn(() => 'out'),
      kill: jest.fn(),
      killAll: jest.fn(),
    };
    const [create, write, resize, buffer, kill] = createPtyControllers({ terminalHost });
    expect([create.channel, write.channel, resize.channel, buffer.channel, kill.channel])
      .toEqual([ipcPtyCreateChannel, ipcPtyWriteChannel, ipcPtyResizeChannel, ipcPtyBufferChannel, ipcPtyKillChannel]);
    const e = fixtureIpcMainEvent();
    await expect(create.handle(e, { cols: 80, rows: 24 })).resolves.toEqual({ ok: true, terminalId: 't1' });
    await write.handle(e, 't1', 'ls\r');
    await resize.handle(e, 't1', 100, 30);
    await expect(buffer.handle(e, 't1')).resolves.toBe('out');
    await kill.handle(e, 't1');
    expect(terminalHost.write).toHaveBeenCalledWith('t1', 'ls\r');
    expect(terminalHost.resize).toHaveBeenCalledWith('t1', 100, 30);
    expect(terminalHost.kill).toHaveBeenCalledWith('t1');
  });
});
