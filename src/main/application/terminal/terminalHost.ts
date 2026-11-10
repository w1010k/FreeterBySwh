/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** The part of a node-pty process the host uses. */
export interface PtyProcess {
  onData(fn: (data: string) => void): unknown;
  onExit(fn: (e: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface TerminalCreateOptions {
  cols: number;
  rows: number;
  /** Defaults to the platform shell. */
  shell?: string;
  cwd?: string;
  /** Typed into the shell once it starts (e.g. 'claude'). */
  command?: string;
}

export type TerminalCreateResult = { ok: true; terminalId: string } | { ok: false; message: string };

/** A copy of a terminal's screen and scrollback (infra: a headless xterm), to redraw a re-attached view. */
export interface TerminalMirror {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** The screen and scrollback as terminal output (escape sequences included), once the output before is parsed. */
  serialize(): Promise<string>;
  dispose(): void;
  /** The title the output sets (OSC 0/2), e.g. Claude Code's. */
  onTitle(fn: (title: string) => void): void;
}

/** A terminal's screen copy and the number of the last output chunk it covers (output numbered from 1). */
export interface TerminalSnapshot {
  screen: string;
  seq: number;
}

type Deps = {
  spawnPty: (shell: string, o: { cwd?: string; cols: number; rows: number; env: Record<string, string> }) => PtyProcess;
  /** Looked for when a shell starts without one (not at app start). */
  defaultShell: () => string;
  /** A shell with no folder set starts here (Freeter's own folder can be system32 when the installer started it). */
  defaultCwd: string;
  /** Includes FREETER_AI_ENDPOINT / FREETER_AI_ORIGIN so `freeter` works in the shell. */
  env: Record<string, string>;
  /** `seq`: the number of the last output chunk in `data` (a re-attached view skips what its screen copy covers). */
  emitData: (terminalId: string, data: string, seq: number) => void;
  emitExit: (terminalId: string, exitCode: number) => void;
  emitTitle: (terminalId: string, title: string) => void;
  newId: () => string;
  /**
   * Output is sent at most once per interval (a busy shell would flood IPC otherwise); the first output after a quiet
   * interval goes at once, so a keystroke's echo waits for nothing (like Paseo's terminal output coalescer). 16 ms: the
   * view draws once per frame anyway, so smaller pieces would add messages, not speed.
   */
  batchMs: number;
  createMirror: (cols: number, rows: number) => TerminalMirror;
}

interface Session {
  pty: PtyProcess;
  mirror: TerminalMirror;
  pending: string;
  timer?: ReturnType<typeof setTimeout>;
  lastSentAt: number;
  /** Output chunks so far. */
  seq: number;
}

const isSize = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 1000;

/** Shells running in pseudo-terminals for the app's terminal views (spec F). */
export function createTerminalHost({ spawnPty, defaultShell, defaultCwd, env, emitData, emitExit, emitTitle, newId, batchMs, createMirror }: Deps) {
  const sessions = new Map<string, Session>();

  const flush = (id: string, s: Session) => {
    clearTimeout(s.timer);
    s.timer = undefined;
    if (s.pending !== '') {
      s.lastSentAt = performance.now();
      emitData(id, s.pending, s.seq);
      s.pending = '';
    }
  };

  return {
    create(o: TerminalCreateOptions): TerminalCreateResult {
      if (!isSize(o.cols) || !isSize(o.rows)) {
        return { ok: false, message: 'Invalid terminal size' };
      }
      // The copy first: a shell started without one could not be ended by anything here.
      let mirror: TerminalMirror;
      let pty: PtyProcess;
      try {
        mirror = createMirror(o.cols, o.rows);
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      try {
        pty = spawnPty(o.shell || defaultShell(), { cwd: o.cwd || defaultCwd, cols: o.cols, rows: o.rows, env });
      } catch (err) {
        mirror.dispose();
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      const id = newId();
      const s: Session = { pty, mirror, pending: '', lastSentAt: -Infinity, seq: 0 };
      sessions.set(id, s);
      mirror.onTitle(title => emitTitle(id, title));
      pty.onData(data => {
        s.mirror.write(data);
        s.seq++;
        s.pending += data;
        if (s.timer !== undefined) {
          return;
        }
        // A monotonic clock: a wall clock set back would hold the output until it catches up.
        const since = performance.now() - s.lastSentAt;
        if (since >= batchMs) {
          flush(id, s);
        } else {
          s.timer = setTimeout(() => flush(id, s), batchMs - since);
        }
      });
      pty.onExit(({ exitCode }) => {
        flush(id, s);
        s.mirror.dispose();
        sessions.delete(id);
        emitExit(id, exitCode);
      });
      if (o.command) {
        pty.write(`${o.command}\r`);
      }
      return { ok: true, terminalId: id };
    },
    write(id: string, data: string): void {
      sessions.get(id)?.pty.write(data);
    },
    resize(id: string, cols: number, rows: number): void {
      const s = sessions.get(id);
      if (s && isSize(cols) && isSize(rows)) {
        s.pty.resize(cols, rows);
        s.mirror.resize(cols, rows);
      }
    },
    /**
     * The screen copy for a view that attaches again. Held output goes out first, so every chunk numbered up to
     * `seq` is either in the copy or sent before it; the view skips sent chunks the copy already covers.
     */
    async buffer(id: string): Promise<TerminalSnapshot | undefined> {
      const s = sessions.get(id);
      if (!s) {
        return undefined;
      }
      flush(id, s);
      const seq = s.seq;
      // Asked now, answered once the chunks written so far (up to seq) are parsed: the copy covers exactly those.
      return { screen: await s.mirror.serialize(), seq };
    },
    kill(id: string): void {
      sessions.get(id)?.pty.kill();
    },
    killAll(): void {
      sessions.forEach(s => s.pty.kill());
    }
  };
}

export type TerminalHost = ReturnType<typeof createTerminalHost>;

/**
 * `env` with `dir` first on PATH, under one PATH key. Windows names it "Path"; node-pty
 * passes keys as they are, so a second "PATH" key would leave the shell on the old one.
 */
export function prependPath(env: Record<string, string>, dir: string, delimiter: string): Record<string, string> {
  const pathKeys = Object.keys(env).filter(k => k.toUpperCase() === 'PATH');
  const rest = Object.fromEntries(Object.entries(env).filter(([k]) => !pathKeys.includes(k)));
  const current = pathKeys.map(k => env[k]).find(v => v !== '') ?? '';
  return { ...rest, PATH: current ? `${dir}${delimiter}${current}` : dir };
}
