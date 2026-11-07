/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Controller } from '@/controllers/controller';
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
  IpcPtyWriteArgs,
  IpcPtyWriteRes,
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
  Controller<IpcPtyWriteArgs, IpcPtyWriteRes>,
  Controller<IpcPtyResizeArgs, IpcPtyResizeRes>,
  Controller<IpcPtyBufferArgs, IpcPtyBufferRes>,
  Controller<IpcPtyKillArgs, IpcPtyKillRes>,
] {
  return [{
    channel: ipcPtyCreateChannel,
    handle: async (_event, o) => terminalHost.create(o)
  }, {
    channel: ipcPtyWriteChannel,
    handle: async (_event, id, data) => terminalHost.write(id, data)
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
