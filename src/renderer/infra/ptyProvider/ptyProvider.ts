/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PtyProvider } from '@/application/interfaces/ptyProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createSubscribers } from '@/infra/subscribers/subscribers';
import {
  IpcPtyBufferArgs, IpcPtyBufferRes, IpcPtyCreateArgs, IpcPtyCreateRes, IpcPtyKillArgs, IpcPtyKillRes, IpcPtyResizeArgs, IpcPtyResizeRes,
  IpcPtyWriteArgs,
  ipcPtyBufferChannel, ipcPtyCreateChannel, ipcPtyDataChannel, ipcPtyExitChannel, ipcPtyKillChannel, ipcPtyResizeChannel, ipcPtyTitleChannel, ipcPtyWriteChannel
} from '@common/ipc/channels';

/**
 * write/resize/kill are fire-and-forget: a failed call (shell already gone) is dropped.
 * One IPC listener per channel for the app's lifetime;
 * it hands each message to the views subscribed to that terminal.
 */
export function createPtyProvider(): PtyProvider {
  const dataSubs = createSubscribers<[data: string, seq: number]>();
  const exitSubs = createSubscribers<number>();
  const titleFns = new Set<(terminalId: string, title: string) => void>();
  electronIpcRenderer.on(ipcPtyDataChannel, (id, data, seq) => {
    if (typeof id === 'string' && typeof data === 'string' && typeof seq === 'number') {
      dataSubs.emit(id, [data, seq]);
    }
  });
  electronIpcRenderer.on(ipcPtyTitleChannel, (id, title) => {
    if (typeof id === 'string' && typeof title === 'string') {
      titleFns.forEach(fn => fn(id, title));
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
      // Sent, not invoked: a keystroke waits for no answer (like Paseo's terminal input).
      electronIpcRenderer.send<IpcPtyWriteArgs>(ipcPtyWriteChannel, id, data);
    },
    resize: (id, cols, rows) => {
      electronIpcRenderer.invoke<IpcPtyResizeArgs, IpcPtyResizeRes>(ipcPtyResizeChannel, id, cols, rows).catch(() => undefined);
    },
    kill: (id) => {
      electronIpcRenderer.invoke<IpcPtyKillArgs, IpcPtyKillRes>(ipcPtyKillChannel, id).catch(() => undefined);
    },
    buffer: (id) => electronIpcRenderer.invoke<IpcPtyBufferArgs, IpcPtyBufferRes>(ipcPtyBufferChannel, id),
    onData: (id, fn) => dataSubs.add(id, ([data, seq]) => fn(data, seq)),
    onTitle: fn => {
      titleFns.add(fn);
      return () => {
        titleFns.delete(fn);
      };
    },
    onExit: (id, fn) => exitSubs.add(id, fn),
  };
}
