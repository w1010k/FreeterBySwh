/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EventEmitter } from 'node:events';
import { contextBridge, ipcRenderer } from 'electron';
import { RendererGlobals } from '@/infra/interfaces/globals';
import '@/preload/index';

// The mocked ipcRenderer is an EventEmitter: on, once and removeListener behave like Electron's.
jest.mock('electron', () => {
  const { EventEmitter: Emitter } = jest.requireActual<typeof import('node:events')>('node:events');
  return {
    ipcRenderer: Object.assign(new Emitter(), { invoke: jest.fn(), send: jest.fn() }),
    contextBridge: { exposeInMainWorld: jest.fn() },
  };
});

describe('preload', () => {
  it('removeListener removes a listener added with on (the page gets no more messages)', () => {
    const globals = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls[0][1] as RendererGlobals;
    const api = globals.getMainApiOnce();
    const ipc = ipcRenderer as unknown as EventEmitter;
    const listener = jest.fn();
    api?.electronIpcRenderer.on('freeter:x', listener);
    ipc.emit('freeter:x', {}, 1);
    expect(listener).toHaveBeenCalledWith(1); // the event is dropped, the arguments arrive
    api?.electronIpcRenderer.removeListener('freeter:x', listener);
    ipc.emit('freeter:x', {}, 2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ipc.listenerCount('freeter:x')).toBe(0);
  });
});
