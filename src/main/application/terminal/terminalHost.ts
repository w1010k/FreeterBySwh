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

type Deps = {
  spawnPty: (shell: string, o: { cwd?: string; cols: number; rows: number; env: Record<string, string> }) => PtyProcess;
  defaultShell: string;
  /** Includes FREETER_AI_ENDPOINT / FREETER_AI_ORIGIN so `freeter` works in the shell. */
  env: Record<string, string>;
  emitData: (terminalId: string, data: string) => void;
  emitExit: (terminalId: string, exitCode: number) => void;
  newId: () => string;
  /** Output is sent at most once per interval: a busy shell would flood IPC otherwise. */
  batchMs: number;
  /** Characters of recent output kept per terminal, to redraw a re-attached view. */
  maxBuffer: number;
}

interface Session {
  pty: PtyProcess;
  pending: string;
  timer?: ReturnType<typeof setTimeout>;
  buffer: string;
}

const isSize = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 1000;

/** Shells running in pseudo-terminals for the app's terminal views (spec F). */
export function createTerminalHost({ spawnPty, defaultShell, env, emitData, emitExit, newId, batchMs, maxBuffer }: Deps) {
  const sessions = new Map<string, Session>();

  const flush = (id: string, s: Session) => {
    clearTimeout(s.timer);
    s.timer = undefined;
    if (s.pending !== '') {
      emitData(id, s.pending);
      s.pending = '';
    }
  };

  return {
    create(o: TerminalCreateOptions): TerminalCreateResult {
      if (!isSize(o.cols) || !isSize(o.rows)) {
        return { ok: false, message: 'Invalid terminal size' };
      }
      let pty: PtyProcess;
      try {
        pty = spawnPty(o.shell || defaultShell, { cwd: o.cwd || undefined, cols: o.cols, rows: o.rows, env });
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      const id = newId();
      const s: Session = { pty, pending: '', buffer: '' };
      sessions.set(id, s);
      pty.onData(data => {
        s.buffer = (s.buffer + data).slice(-maxBuffer);
        s.pending += data;
        s.timer ??= setTimeout(() => flush(id, s), batchMs);
      });
      pty.onExit(({ exitCode }) => {
        flush(id, s);
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
      if (isSize(cols) && isSize(rows)) {
        sessions.get(id)?.pty.resize(cols, rows);
      }
    },
    buffer(id: string): string | undefined {
      return sessions.get(id)?.buffer;
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
