/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createForegroundWindowReader } from '@/infra/osActivity/foregroundWindow';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

// A stand-in PowerShell process: stdout emits text lines, 'exit' simulates a death.
function fakeProc() {
  const stdout = Object.assign(new EventEmitter(), { setEncoding: jest.fn() });
  return Object.assign(new EventEmitter(), { stdout, kill: jest.fn() });
}

describe('ForegroundWindowReader', () => {
  const realPlatform = process.platform;
  let procs: ReturnType<typeof fakeProc>[];

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    procs = [];
    jest.mocked(spawn).mockImplementation((() => {
      const p = fakeProc();
      procs.push(p);
      return p;
    }) as unknown as typeof spawn);
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(process, 'platform', { value: realPlatform });
  });

  it('respawns after an unexpected exit, and gives up after 5 deaths in a row', () => {
    const reader = createForegroundWindowReader();
    const onSample = jest.fn();
    reader.start(onSample);

    for (let i = 0; i < 4; i++) {
      procs[procs.length - 1].emit('exit');
      jest.advanceTimersByTime(30_000);
    }
    expect(procs).toHaveLength(5);

    procs[4].emit('exit');
    jest.advanceTimersByTime(30_000);
    expect(procs).toHaveLength(5);
    reader.stop();
  });

  it('resets the failure streak on a sample, and does not respawn after stop()', () => {
    const reader = createForegroundWindowReader();
    const onSample = jest.fn();
    reader.start(onSample);

    for (let i = 0; i < 4; i++) {
      procs[procs.length - 1].emit('exit');
      jest.advanceTimersByTime(30_000);
    }
    procs[4].stdout.emit('data', '{"app":"카카오톡","title":"t"}\n');
    expect(onSample).toHaveBeenCalledWith({ app: '카카오톡', title: 't' });
    procs[4].emit('exit');
    jest.advanceTimersByTime(30_000);
    expect(procs).toHaveLength(6);

    reader.stop();
    procs[5].emit('exit');
    jest.advanceTimersByTime(30_000);
    expect(procs).toHaveLength(6);
  });
});
