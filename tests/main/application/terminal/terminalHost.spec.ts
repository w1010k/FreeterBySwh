/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTerminalHost, prependPath, PtyProcess } from '@/application/terminal/terminalHost';

class FakePty implements PtyProcess {
  written: string[] = [];
  size = { cols: 0, rows: 0 };
  killed = false;
  private dataFns: ((d: string) => void)[] = [];
  private exitFns: ((e: { exitCode: number }) => void)[] = [];
  onData(fn: (d: string) => void) {
    this.dataFns.push(fn);
    return { dispose: () => undefined };
  }
  onExit(fn: (e: { exitCode: number }) => void) {
    this.exitFns.push(fn);
    return { dispose: () => undefined };
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(cols: number, rows: number) {
    this.size = { cols, rows };
  }
  kill() {
    this.killed = true;
  }
  out(d: string) {
    this.dataFns.forEach(f => f(d));
  }
  exit(code: number) {
    this.exitFns.forEach(f => f({ exitCode: code }));
  }
}

function setup(maxBuffer = 100) {
  jest.useFakeTimers();
  const ptys: FakePty[] = [];
  const spawnPty = jest.fn((_shell: string, _o: { cwd?: string; cols: number; rows: number; env: Record<string, string> }) => {
    const p = new FakePty();
    ptys.push(p);
    return p;
  });
  const data: [string, string][] = [];
  const exits: [string, number][] = [];
  let n = 0;
  const host = createTerminalHost({
    spawnPty,
    defaultShell: 'powershell.exe',
    env: { PATH: 'P', FREETER_AI_ORIGIN: 'terminal' },
    emitData: (id, d) => data.push([id, d]),
    emitExit: (id, c) => exits.push([id, c]),
    newId: () => `t${++n}`,
    batchMs: 16,
    maxBuffer,
  });
  return { host, ptys, spawnPty, data, exits };
}

describe('createTerminalHost', () => {
  afterEach(() => jest.useRealTimers());

  it('starts the default shell with the given size, folder and env, then runs the start command', () => {
    const { host, ptys, spawnPty } = setup();
    expect(host.create({ cols: 100, rows: 30, cwd: 'C:/w', command: 'claude' })).toEqual({ ok: true, terminalId: 't1' });
    expect(spawnPty).toHaveBeenCalledWith('powershell.exe', { cwd: 'C:/w', cols: 100, rows: 30, env: { PATH: 'P', FREETER_AI_ORIGIN: 'terminal' } });
    expect(ptys[0].written).toEqual(['claude\r']);
  });

  it('batches output into one message per interval', () => {
    const { host, ptys, data } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('a');
    ptys[0].out('b');
    expect(data).toEqual([]);
    jest.advanceTimersByTime(16);
    expect(data).toEqual([['t1', 'ab']]);
  });

  it('keeps the latest output up to maxBuffer for re-attaching', () => {
    const { host, ptys } = setup(5);
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('123');
    ptys[0].out('4567');
    expect(host.buffer('t1')).toBe('34567');
    expect(host.buffer('nope')).toBeUndefined();
  });

  it('writes, resizes and kills', () => {
    const { host, ptys } = setup();
    host.create({ cols: 80, rows: 24 });
    host.write('t1', 'ls\r');
    host.resize('t1', 120, 40);
    host.kill('t1');
    expect(ptys[0].written).toEqual(['ls\r']);
    expect(ptys[0].size).toEqual({ cols: 120, rows: 40 });
    expect(ptys[0].killed).toBe(true);
  });

  it('flushes pending output, reports the exit and forgets the terminal', () => {
    const { host, ptys, data, exits } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('bye');
    ptys[0].exit(3);
    expect(data).toEqual([['t1', 'bye']]);
    expect(exits).toEqual([['t1', 3]]);
    expect(host.buffer('t1')).toBeUndefined();
  });

  it('rejects bad sizes and a shell that fails to start', () => {
    const { host, spawnPty } = setup();
    expect(host.create({ cols: 0, rows: 24 })).toMatchObject({ ok: false });
    expect(host.create({ cols: 80.5, rows: 24 })).toMatchObject({ ok: false });
    spawnPty.mockImplementationOnce(() => {
      throw new Error('File not found');
    });
    expect(host.create({ cols: 80, rows: 24, shell: 'nope.exe' })).toEqual({ ok: false, message: 'File not found' });
  });

  it('killAll ends every terminal', () => {
    const { host, ptys } = setup();
    host.create({ cols: 80, rows: 24 });
    host.create({ cols: 80, rows: 24 });
    host.killAll();
    expect(ptys.map(p => p.killed)).toEqual([true, true]);
  });
});

describe('prependPath', () => {
  it('keeps one PATH entry whatever its case (Windows names it Path), with the folder first', () => {
    expect(prependPath({ Path: 'C:\\w', Other: '1' }, 'C:\\bin', ';')).toEqual({ PATH: 'C:\\bin;C:\\w', Other: '1' });
    expect(prependPath({ PATH: '/usr/bin' }, '/opt/bin', ':')).toEqual({ PATH: '/opt/bin:/usr/bin' });
    expect(prependPath({}, '/opt/bin', ':')).toEqual({ PATH: '/opt/bin' });
  });
});
