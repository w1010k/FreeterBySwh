/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ActionBarItems, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { agentSvg, restartSvg } from './icons';
import styles from './widget.module.scss';
import { takeRevealedByAi } from '@/base/ai/aiActivity';

/**
 * Shells outlive the widget's view: Memory Saver unmounts unused workflows, and a
 * running agent (e.g. Claude Code) must keep going. A view that mounts again redraws
 * from the output main keeps. A deleted widget's shell ends (forgetTerminalSession).
 */
const sessionByWidget = new Map<string, string>();
/** Widgets whose shell exited: a new view shows that and waits for Restart Shell (no surprise start command). */
const exitedWidgets = new Set<string>();
/** Widgets an AI write showed without the confirm box: their first shell waits for the user, across remounts too. */
const waitingForUser = new Set<string>();
/** The end of each shell's output, to tell whether a shell prompt is in front. */
const tailByWidget = new Map<string, string>();
/** Deleted widgets: a shell that finishes starting after the delete ends at once. ponytail: ids are never reused, kept for the session. */
const deletedWidgets = new Set<string>();
const EXITED_NOTE = '\r\n[The shell has exited. Restart Shell starts a new one.]\r\n';
/** The app's pty module (one for all widgets), kept to end the shell of a deleted widget. */
let ptyOfSessions: WidgetReactComponentProps<Settings>['widgetApi']['pty'] | undefined;

/** The widget's shell ends and its state goes (delete, Restart Shell). */
function endShell(widgetId: string): void {
  const terminalId = sessionByWidget.get(widgetId);
  sessionByWidget.delete(widgetId);
  exitedWidgets.delete(widgetId);
  waitingForUser.delete(widgetId);
  takeRevealedByAi(widgetId); // Restart (or delete) is the user's start: no mark is left
  tailByWidget.delete(widgetId);
  if (terminalId) {
    ptyOfSessions?.kill(terminalId);
  }
}

/** The widget was deleted: its shell ends. */
export function forgetTerminalSession(widgetId: string): void {
  deletedWidgets.add(widgetId);
  endShell(widgetId);
}

// eslint-disable-next-line no-control-regex
const ansi = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g;

/**
 * ponytail: guesses from the output whether the shell prompt is in front (last line ends like
 * "PS C:\\> ", "$ ", "# ", "% ", "❯ "). node-pty cannot name the foreground program on Windows.
 * A custom prompt that ends otherwise only makes the Start buttons refuse.
 */
function atShellPrompt(tail: string): boolean {
  const lines = tail.replace(ansi, '').split(/\r?\n|\r/);
  const last = (lines[lines.length - 1] ?? '').trim();
  // Language prompts end the same way: Python ">>>" / "...", Node ">", Ruby "irb(...)>", and PowerShell's ">>" (unfinished input).
  if (/^(>>>|>>|\.\.\.|>)$/.test(last) || last.startsWith('irb(')) {
    return false;
  }
  return /[>$#%❯]$/.test(last);
}

/** For tests. */
export function resetTerminalSessions(): void {
  sessionByWidget.clear();
  deletedWidgets.clear();
  exitedWidgets.clear();
  waitingForUser.clear();
  tailByWidget.clear();
}

function LiveTerminal({id, settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const {pty, updateActionBar} = widgetApi;
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Bumped to start a fresh shell.
  const [generation, setGeneration] = useState(0);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) {
      return undefined;
    }
    const term = new Terminal({ cursorBlink: true, fontSize: 13, scrollback: 5000 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    try {
      fit.fit();
    } catch { /* not laid out yet */ }

    let disposed = false;
    const offs: (() => void)[] = [];
    /** The size the shell has; a drag fires the observer many times with the same size. */
    let sentSize = '';
    const sendSize = (terminalId: string) => {
      const size = `${term.cols}x${term.rows}`;
      if (size !== sentSize) {
        sentSize = size;
        pty.resize(terminalId, term.cols, term.rows);
      }
    };
    /** Watched before any wait, so an exit while this view mounts is not missed. */
    const watchExit = (terminalId: string) => {
      offs.push(pty.onExit(terminalId, code => {
        // An old shell (Restart) or the shell of a deleted widget: nothing to mark.
        if (sessionByWidget.get(id) !== terminalId) {
          return;
        }
        sessionByWidget.delete(id);
        exitedWidgets.add(id);
        term.write(`\r\n[The shell exited with code ${code}. Restart Shell starts a new one.]\r\n`);
      }));
    };
    const attach = (terminalId: string) => {
      offs.push(pty.onData(terminalId, data => {
        tailByWidget.set(id, ((tailByWidget.get(id) ?? '') + data).slice(-400));
        term.write(data);
      }));
      const input = term.onData(data => pty.write(terminalId, data));
      offs.push(() => input.dispose());
    };

    (async () => {
      if (exitedWidgets.has(id)) {
        term.write(EXITED_NOTE);
        return;
      }
      let terminalId = sessionByWidget.get(id);
      if (terminalId) {
        watchExit(terminalId);
        // ponytail: output between this read and the subscription below can be lost; subscribe-first would duplicate it instead.
        const earlier = await pty.buffer(terminalId);
        if (earlier === undefined) {
          if (sessionByWidget.get(id) !== terminalId) {
            return; // its exit came first, and watchExit said so
          }
          // It ended while no view was attached.
          sessionByWidget.delete(id);
          exitedWidgets.add(id);
          if (!disposed) {
            term.write(EXITED_NOTE);
          }
          return;
        }
        if (!disposed) {
          tailByWidget.set(id, earlier.slice(-400));
          term.write(earlier);
        }
        if (sessionByWidget.get(id) !== terminalId) {
          return; // it exited during the wait (watchExit showed that)
        }
      }
      // Taken by every view (a running shell uses up its mark too), acted on only before a shell exists.
      if (takeRevealedByAi(id) && !terminalId) {
        waitingForUser.add(id);
      }
      if (!terminalId && waitingForUser.has(id)) {
        // Shown by an AI write that ran without the confirm box: the user starts the shell (Restart Shell).
        term.write('[This terminal was shown by an AI action. Restart Shell starts the shell.]\r\n');
        return;
      }
      if (!terminalId) {
        const s = settingsRef.current;
        const res = await pty.create({
          cols: term.cols,
          rows: term.rows,
          shell: s.shell || undefined,
          cwd: s.cwd || undefined,
          command: s.startCommand || undefined,
        });
        if (!res.ok) {
          if (!disposed) {
            setError(res.message);
          }
          return;
        }
        if (disposed || deletedWidgets.has(id)) {
          // The view restarted or went away while the shell started (a newer view starts its own), or the widget was deleted.
          pty.kill(res.terminalId);
          return;
        }
        terminalId = res.terminalId;
        sessionByWidget.set(id, terminalId);
        ptyOfSessions = pty;
        watchExit(terminalId);
        // The view may have resized while the shell started (its size was read before).
        sendSize(terminalId);
      }
      if (!disposed) {
        setError(null);
        attach(terminalId);
      }
    })().catch(err => {
      if (!disposed) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    const resize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      const terminalId = sessionByWidget.get(id);
      if (terminalId) {
        sendSize(terminalId);
      }
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    observer?.observe(el);

    return () => {
      disposed = true;
      observer?.disconnect();
      offs.forEach(off => off());
      term.dispose();
    };
  }, [id, pty, generation]);

  const restart = useCallback(() => {
    // The same clean-up as for a deleted widget (the widget stays); then a new view starts a new shell.
    ptyOfSessions = pty;
    endShell(id);
    setGeneration(g => g + 1);
  }, [id, pty]);

  const typeCommand = useCallback((command: string) => {
    const terminalId = sessionByWidget.get(id);
    if (!terminalId) {
      if (waitingForUser.has(id)) {
        termRef.current?.write('\r\n[Restart Shell starts the shell first.]\r\n');
      }
      return;
    }
    // Typed into a running program (e.g. Claude Code itself), the command would become its input.
    if (!atShellPrompt(tailByWidget.get(id) ?? '')) {
      termRef.current?.write(`\r\n[Freeter: a program seems to be running. Exit it first, or type ${command} yourself.]\r\n`);
      return;
    }
    pty.write(terminalId, `${command}\r`);
  }, [id, pty]);

  useEffect(() => {
    const items: ActionBarItems = [
      { id: 'START-CLAUDE', icon: agentSvg, title: 'Start Claude Code', doAction: async () => typeCommand('claude') },
      { id: 'START-CODEX', icon: agentSvg, title: 'Start Codex', doAction: async () => typeCommand('codex') },
      { id: 'RESTART', icon: restartSvg, title: 'Restart Shell', doAction: async () => restart() },
    ];
    updateActionBar(items);
  }, [updateActionBar, typeCommand, restart]);

  return (
    <div className={styles['terminal']}>
      {error && <div role="alert" className={styles['error']}>The shell could not start: {error}</div>}
      <div ref={hostRef} className={styles['host']}/>
    </div>
  );
}

/**
 * The settings screen previews the widget with the same id: a live view there would attach
 * to the widget's shell and resize it to the preview's size.
 */
function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  if (props.env.isPreview) {
    return <div className={styles['preview']}>The shell runs in the widget.</div>;
  }
  return <LiveTerminal {...props}/>;
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
