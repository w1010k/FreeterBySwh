/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PtyProvider } from '@/application/interfaces/ptyProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createSubscribers } from '@/infra/subscribers/subscribers';
import {
  IpcPtyBufferArgs, IpcPtyBufferRes, IpcPtyCreateArgs, IpcPtyCreateRes, IpcPtyKillArgs, IpcPtyKillRes, IpcPtyResizeArgs, IpcPtyResizeRes,
  IpcPtyWriteArgs, IpcPtyWriteRes,
  ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyDataChannel, ipcPtyExitChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyWriteChannel
} from '@common/ipc/channels';

/**
 * write/resize/kill are fire-and-forget: a failed call (shell already gone) is dropped.
 * One IPC listener per channel for the app's lifetime;
 * it hands each message to the views subscribed to that terminal.
 */
export function createPtyProvider(): PtyProvider {
  const dataSubs = createSubscribers<string>();
  const exitSubs = createSubscribers<number>();
  electronIpcRenderer.on(ipcPtyDataChannel, (id, data) => {
    if (typeof id === 'string' && typeof data === 'string') {
      dataSubs.emit(id, data);
    }
  });
  electronIpcRenderer.on(ipcPtyExitChannel, (id, code) => {
    if (typeof id === 'string' && typeof code === 'number') {
      exitSubs.emit(id, code);
    }
  });
  return {
    create: (o) => electronIpcRenderer.invoke<IpcPtyCreateArgs, IpcPtyCreateRes>(ipcPtyCreateChannel, o),
    write: (id, data) => {
      electronIpcRenderer.invoke<IpcPtyWriteArgs, IpcPtyWriteRes>(ipcPtyWriteChannel, id, data).catch(() => undefined);
    },
    resize: (id, cols, rows) => {
      electronIpcRenderer.invoke<IpcPtyResizeArgs, IpcPtyResizeRes>(ipcPtyResizeChannel, id, cols, rows).catch(() => undefined);
    },
    kill: (id) => {
      electronIpcRenderer.invoke<IpcPtyKillArgs, IpcPtyKillRes>(ipcPtyKillChannel, id).catch(() => undefined);
    },
    buffer: (id) => electronIpcRenderer.invoke<IpcPtyBufferArgs, IpcPtyBufferRes>(ipcPtyBufferChannel, id),
    onData: (id, fn) => dataSubs.add(id, fn),
    onExit: (id, fn) => exitSubs.add(id, fn),
  };
}
