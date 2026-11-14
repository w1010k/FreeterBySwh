/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTerminalHost, prependPath, PtyProcess, TerminalMirror } from '@/application/terminal/terminalHost';

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

class FakeMirror implements TerminalMirror {
  written: string[] = [];
  size: { cols: number; rows: number };
  disposed = false;
  constructor(cols: number, rows: number) {
    this.size = { cols, rows };
  }
  write(d: string) {
    this.written.push(d);
  }
  resize(cols: number, rows: number) {
    this.size = { cols, rows };
  }
  async serialize() {
    return `[screen:${this.written.join('')}]`;
  }
  dispose() {
    this.disposed = true;
  }
  titleFn?: (t: string) => void;
  onTitle(fn: (t: string) => void) {
    this.titleFn = fn;
  }
}

function setup() {
  jest.useFakeTimers();
  const ptys: FakePty[] = [];
  const spawnPty = jest.fn((_shell: string, _o: { cwd?: string; cols: number; rows: number; env: Record<string, string> }) => {
    const p = new FakePty();
    ptys.push(p);
    return p;
  });
  const data: [string, string][] = [];
  const seqs: number[] = [];
  const titles: [string, string][] = [];
  const exits: [string, number][] = [];
  let n = 0;
  const mirrors: FakeMirror[] = [];
  const defaultShell = jest.fn(() => 'powershell.exe');
  const host = createTerminalHost({
    spawnPty,
    defaultShell,
    defaultCwd: 'C:/Users/me',
    env: { PATH: 'P', FREETER_AI_ORIGIN: 'terminal' },
    emitData: (id, d, seq) => {
      data.push([id, d]);
      seqs.push(seq);
    },
    emitTitle: (id, t) => titles.push([id, t]),
    emitExit: (id, c) => exits.push([id, c]),
    newId: () => `t${++n}`,
    batchMs: 16,
    createMirror: (cols, rows) => {
      const m = new FakeMirror(cols, rows);
      mirrors.push(m);
      return m;
    },
  });
  return { host, ptys, spawnPty, data, exits, mirrors, seqs, titles, defaultShell };
}

describe('createTerminalHost', () => {
  afterEach(() => jest.useRealTimers());

  it('looks for the default shell only when a shell starts without one (not at app start)', () => {
    const { host, defaultShell } = setup();
    expect(defaultShell).not.toHaveBeenCalled();
    host.create({ cols: 80, rows: 24, shell: 'cmd.exe' });
    expect(defaultShell).not.toHaveBeenCalled();
    host.create({ cols: 80, rows: 24 });
    expect(defaultShell).toHaveBeenCalledTimes(1);
  });

  it('starts the default shell with the given size, folder and env, then runs the start command', () => {
    const { host, ptys, spawnPty } = setup();
    expect(host.create({ cols: 100, rows: 30, cwd: 'C:/w', command: 'claude' })).toEqual({ ok: true, terminalId: 't1' });
    expect(spawnPty).toHaveBeenCalledWith('powershell.exe', { cwd: 'C:/w', cols: 100, rows: 30, env: { PATH: 'P', FREETER_AI_ORIGIN: 'terminal' } });
    expect(ptys[0].written).toEqual(['claude\r']);
  });

  it('starts a shell with no folder set in the home folder, not in the folder Acedeck was started in', () => {
    const { host, spawnPty } = setup();
    host.create({ cols: 80, rows: 24 });
    expect(spawnPty).toHaveBeenCalledWith('powershell.exe', expect.objectContaining({ cwd: 'C:/Users/me' }));
  });

  it('sends the first output after a quiet interval at once (a keystroke echo waits for nothing), and a burst once per interval', () => {
    const { host, ptys, data } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('a');
    expect(data).toEqual([['t1', 'a']]);
    ptys[0].out('b');
    ptys[0].out('c');
    expect(data).toEqual([['t1', 'a']]);
    jest.advanceTimersByTime(16);
    expect(data).toEqual([['t1', 'a'], ['t1', 'bc']]);
    jest.advanceTimersByTime(20);
    ptys[0].out('d');
    expect(data[data.length - 1]).toEqual(['t1', 'd']);
  });

  it('keeps a copy of the screen for re-attaching (all output goes to it; no work that grows with the history)', async () => {
    const { host, ptys, mirrors } = setup();
    host.create({ cols: 80, rows: 24 });
    expect(mirrors[0].size).toEqual({ cols: 80, rows: 24 });
    ptys[0].out('123');
    ptys[0].out('4567');
    await expect(host.buffer('t1')).resolves.toEqual({ screen: '[screen:1234567]', seq: 2 });
    host.resize('t1', 100, 30);
    expect(mirrors[0].size).toEqual({ cols: 100, rows: 30 });
    await expect(host.buffer('nope')).resolves.toBeUndefined();
  });

  it('writes keystrokes straight to the shell (the IPC order keeps them before a later resize)', () => {
    const { host, ptys } = setup();
    host.create({ cols: 80, rows: 24 });
    host.write('t1', 'l');
    host.write('t1', 's');
    expect(ptys[0].written).toEqual(['l', 's']);
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

  it('numbers the output, and gives with the screen copy the number it covers (held output is sent first)', async () => {
    const { host, ptys, data, seqs } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('a'); // sent at once: chunk 1
    ptys[0].out('b'); // held: chunk 2
    const copy = host.buffer('t1');
    ptys[0].out('c'); // after the copy was asked for: chunk 3
    await expect(copy).resolves.toEqual({ screen: '[screen:ab]', seq: 2 }); // 'c' (chunk 3) is not in the copy: it is sent after
    expect(data).toEqual([['t1', 'a'], ['t1', 'b']]); // the held 'b' went before the copy
    expect(seqs).toEqual([1, 2]);
    jest.advanceTimersByTime(16);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('keeps sending output after the wall clock jumps back (an NTP fix must not hold output for an hour)', () => {
    const { host, ptys, data } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('a');
    jest.setSystemTime(Date.now() - 3600000);
    ptys[0].out('b');
    jest.advanceTimersByTime(16);
    expect(data).toEqual([['t1', 'a'], ['t1', 'b']]);
  });

  it('starts no shell when its screen copy cannot be made (no shell is left that nothing can end)', () => {
    const { host, spawnPty } = setup();
    const broken = createTerminalHost({
      spawnPty, defaultShell: () => 'sh', defaultCwd: '/', env: {}, emitData: jest.fn(), emitExit: jest.fn(), emitTitle: jest.fn(), newId: () => 'x', batchMs: 16,
      createMirror: () => { throw new Error('no mirror'); },
    });
    expect(broken.create({ cols: 80, rows: 24 })).toEqual({ ok: false, message: 'no mirror' });
    expect(spawnPty).not.toHaveBeenCalled();
    expect(host).toBeDefined();
  });

  it('passes on the title the shell sets (a tab that is not shown is named too)', () => {
    const { host, mirrors, titles } = setup();
    host.create({ cols: 80, rows: 24 });
    mirrors[0].titleFn?.('Claude Code');
    expect(titles).toEqual([['t1', 'Claude Code']]);
  });

  it('flushes pending output, reports the exit and forgets the terminal (its screen copy too)', async () => {
    const { host, ptys, data, exits, mirrors } = setup();
    host.create({ cols: 80, rows: 24 });
    ptys[0].out('hi');
    ptys[0].out('bye');
    ptys[0].exit(3);
    expect(data).toEqual([['t1', 'hi'], ['t1', 'bye']]);
    expect(exits).toEqual([['t1', 3]]);
    await expect(host.buffer('t1')).resolves.toBeUndefined();
    expect(mirrors[0].disposed).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
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
