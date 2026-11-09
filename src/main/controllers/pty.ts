/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
import { IpcMainListener } from '@/controllers/interfaces/ipcMain';
import { TerminalHost } from '@/application/terminal/terminalHost';
import {
  IpcPtyBufferArgs,
  IpcPtyBufferRes,
  IpcPtyCreateArgs,
  IpcPtyCreateRes,
  IpcPtyKillArgs,
  IpcPtyKillRes,
  IpcPtyResizeArgs,
  IpcPtyResizeRes,
  ipcPtyBufferChannel,
  ipcPtyCreateChannel,
  ipcPtyKillChannel,
  ipcPtyResizeChannel,
  ipcPtyWriteChannel
} from '@common/ipc/channels';

type Deps = {
  terminalHost: TerminalHost;
}

export function createPtyControllers({ terminalHost }: Deps): [
  Controller<IpcPtyCreateArgs, IpcPtyCreateRes>,
  Controller<IpcPtyResizeArgs, IpcPtyResizeRes>,
  Controller<IpcPtyBufferArgs, IpcPtyBufferRes>,
  Controller<IpcPtyKillArgs, IpcPtyKillRes>,
] {
  return [{
    channel: ipcPtyCreateChannel,
    handle: async (_event, o) => terminalHost.create(o)
  }, {
    channel: ipcPtyResizeChannel,
    handle: async (_event, id, cols, rows) => terminalHost.resize(id, cols, rows)
  }, {
    channel: ipcPtyBufferChannel,
    handle: async (_event, id) => terminalHost.buffer(id)
  }, {
    channel: ipcPtyKillChannel,
    handle: async (_event, id) => terminalHost.kill(id)
  }]
}

/** Keystrokes come with ipc send (no answer to wait for, like Paseo's terminal input); text only. */
export function createPtyInputListener({ terminalHost }: Deps): { channel: string; listener: IpcMainListener } {
  return {
    channel: ipcPtyWriteChannel,
    listener: (_event, id, data) => {
      if (typeof id === 'string' && typeof data === 'string') {
        terminalHost.write(id, data);
      }
    },
  };
}
