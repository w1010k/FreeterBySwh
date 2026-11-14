/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { ActionBarItems, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { clampFontSize, Settings } from './settings';
import { terminalThemes } from './theme';
import { uiThemeDataById } from '@/base/uiTheme';
import { restartSvg } from './icons';
import styles from './widget.module.scss';
import { takeRevealedByAi } from '@/base/ai/aiActivity';
import { ShellOption } from '@common/ipc/channels';

/**
 * Shells outlive the widget's view: Memory Saver unmounts unused workflows, and a
 * running agent (e.g. Claude Code) must keep going. A view that mounts again redraws
 * from main's screen copy. A deleted widget's shells end (forgetTerminalSession).
 * The maps below are by session key: one per tab (see tabsByWidget).
 */
const sessionByWidget = new Map<string, string>();
/** Tabs whose shell exited: a new view shows that and waits for Restart Shell (no surprise start command). */
const exitedWidgets = new Set<string>();
/** First tabs of widgets an AI write showed without the confirm box: their shell waits for the user, across remounts too. */
const waitingForUser = new Set<string>();
/** Tabs of deleted widgets: a shell that finishes starting after the delete ends at once. ponytail: ids are never reused, kept for the session. */
const deletedWidgets = new Set<string>();
/**
 * Each widget's tabs: one shell each, by session key (the first tab's key is the widget id, the others
 * `<widget id>#<n>`), and the one shown. Kept like the shells: a view that mounts again shows the same tabs.
 */
interface Tabs {
  keys: string[];
  active: number;
  next: number;
}
const tabsByWidget = new Map<string, Tabs>();
/** The title a tab's shell set (e.g. Claude Code sets one), shown as the tab's label. */
const titleByKey = new Map<string, string>();
/** The shell a tab opened from the menu next to + runs (Restart Shell keeps it); other tabs run the Shell setting. */
const shellByKey = new Map<string, string>();
/** Each widget's zoom (Ctrl+= / Ctrl+- / Ctrl+wheel) from the Font Size setting, for all its tabs; kept for the app session. */
const zoomByWidget = new Map<string, number>();
/** Wheel distance (pixels) for one font size step: one mouse wheel notch. A touchpad pinch adds up small steps. */
const WHEEL_STEP = 100;
/** The shells main found (they do not change while the app runs): asked once, shown at once by later views. */
let shellsAsked: Promise<ShellOption[]> | undefined;
let shellsKnown: ShellOption[] = [];
const EXITED_NOTE = '\r\n[The shell has exited. Restart Shell starts a new one.]\r\n';
/** The app's pty module (one for all widgets), kept to end the shell of a deleted widget. */
let ptyOfSessions: WidgetReactComponentProps<Settings>['widgetApi']['pty'] | undefined;

function tabsOf(widgetId: string): Tabs {
  let tabs = tabsByWidget.get(widgetId);
  if (!tabs) {
    tabs = { keys: [widgetId], active: 0, next: 2 };
    tabsByWidget.set(widgetId, tabs);
  }
  return tabs;
}

const tabNumber = (widgetId: string, key: string) => (key === widgetId ? 1 : Number(key.slice(widgetId.length + 1)));

/** A tab's shell ends and its state goes (delete, close, Restart Shell). */
function endShell(key: string): void {
  const terminalId = sessionByWidget.get(key);
  sessionByWidget.delete(key);
  exitedWidgets.delete(key);
  waitingForUser.delete(key);
  titleByKey.delete(key);
  takeRevealedByAi(key); // Restart (or delete) is the user's start: no mark is left
  if (terminalId) {
    ptyOfSessions?.kill(terminalId);
  }
}

/** The widget was deleted: every tab's shell ends. */
export function forgetTerminalSession(widgetId: string): void {
  const keys = tabsByWidget.get(widgetId)?.keys ?? [widgetId];
  tabsByWidget.delete(widgetId);
  zoomByWidget.delete(widgetId);
  for (const key of keys) {
    deletedWidgets.add(key);
    shellByKey.delete(key);
    endShell(key);
  }
}


/** For tests. */
export function resetTerminalSessions(): void {
  sessionByWidget.clear();
  tabsByWidget.clear();
  titleByKey.clear();
  shellByKey.clear();
  zoomByWidget.clear();
  shellsAsked = undefined;
  shellsKnown = [];
  deletedWidgets.clear();
  exitedWidgets.clear();
  waitingForUser.clear();
}

interface LiveTerminalProps {
  widgetId: string;
  theme: ITheme;
  /** The tab's shell (see tabsByWidget). */
  sessionKey: string;
  settings: Settings;
  widgetApi: WidgetReactComponentProps<Settings>['widgetApi'];
}

function LiveTerminal({widgetId, theme, sessionKey, settings, widgetApi}: LiveTerminalProps) {
  const {pty, updateActionBar, shell} = widgetApi;
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped to start a fresh shell.
  const [generation, setGeneration] = useState(0);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const [zoom, setZoom] = useState(() => zoomByWidget.get(widgetId) ?? 0);
  const fontSize = clampFontSize(settings.fontSize + zoom);
  /** Read when the view is made; later sizes go through the effect below. */
  const fontSizeRef = useRef(fontSize);
  const termRef = useRef<Terminal | null>(null);
  /** Read when the view is made; a later theme goes through the effect below. */
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
    if (termRef.current) {
      termRef.current.options.theme = theme;
    }
  }, [theme]);
  /** Fits the view to its box and tells the shell the new size. */
  const refitRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    fontSizeRef.current = fontSize;
    const term = termRef.current;
    if (term && term.options.fontSize !== fontSize) {
      term.options.fontSize = fontSize;
      refitRef.current();
    }
  }, [fontSize]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) {
      return undefined;
    }
    const term = new Terminal({ cursorBlink: true, fontSize: fontSizeRef.current, scrollback: 5000, theme: themeRef.current,
      // Text at 4.5:1 or more on whatever background a program sets (white on white, grey on blue...).
      minimumContrastRatio: 4.5 });
    termRef.current = term;
    /** null: back to the Font Size setting. */
    const zoomBy = (step: number | null) => {
      const base = settingsRef.current.fontSize;
      // From the size shown: a zoom past the largest size (or a base changed since) gives a visible step at once.
      const shown = clampFontSize(base + (zoomByWidget.get(widgetId) ?? 0));
      const next = step === null ? 0 : clampFontSize(shown + step) - base;
      zoomByWidget.set(widgetId, next);
      setZoom(next);
    };
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Ctrl+click opens a link, as in Windows Terminal: a plain click stays a text selection.
    term.loadAddon(new WebLinksAddon((e, uri) => {
      if (e.ctrlKey || e.metaKey) {
        shell.openExternalUrl(uri).catch(() => undefined);
      }
    }));
    term.open(el);
    // Ctrl+V pastes and Ctrl+C copies a selection, as in Windows Terminal: xterm would send them to the shell as
    // ^V / ^C, and PowerShell cannot read the clipboard from a pseudo-terminal. Left to the browser, the paste goes
    // through xterm's paste handling (bracketed paste) and the copy takes xterm's selection.
    // Ctrl+= / Ctrl+- / Ctrl+0 zoom, as in Windows Terminal.
    term.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) {
        return true;
      }
      const key = e.key.toLowerCase();
      if (key === '=' || key === '+' || key === '-' || key === '0') {
        zoomBy(key === '0' ? null : (key === '-' ? -1 : 1));
        return false;
      }
      return !(key === 'v' || (key === 'c' && term.hasSelection()));
    });
    // Ctrl+wheel zooms the terminal; caught before xterm scrolls, and not left to the page.
    let wheelDistance = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      // Lines or pages: one step per event.
      wheelDistance += e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * WHEEL_STEP;
      const steps = Math.trunc(wheelDistance / WHEEL_STEP);
      if (steps !== 0) {
        wheelDistance -= steps * WHEEL_STEP;
        zoomBy(-steps);
      }
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    try {
      fit.fit();
    } catch { /* not laid out yet */ }

    let disposed = false;
    const offs: (() => void)[] = [() => el.removeEventListener('wheel', onWheel, { capture: true })];
    // WebGL draws a busy TUI (Claude Code) much faster than the DOM renderer; loaded after the view opens, like Paseo.
    // Without WebGL, or once its context is lost, xterm draws with the DOM again.
    const webglFrame = requestAnimationFrame(() => {
      if (disposed) {
        return;
      }
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
        // The addon does not give its context back on dispose; Chromium keeps only a few, and drops the oldest
        // (maybe a visible terminal's) when a remount makes a new one.
        offs.push(() => {
          const gl = el.querySelector('canvas')?.getContext('webgl2') as WebGL2RenderingContext | null | undefined;
          webgl.dispose();
          gl?.getExtension('WEBGL_lose_context')?.loseContext();
        });
      } catch {
        // the DOM renderer stays
      }
    });
    offs.push(() => cancelAnimationFrame(webglFrame));
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
        if (sessionByWidget.get(sessionKey) !== terminalId) {
          return;
        }
        sessionByWidget.delete(sessionKey);
        exitedWidgets.add(sessionKey);
        term.write(`\r\n[The shell exited with code ${code}. Restart Shell starts a new one.]\r\n`);
      }));
    };
    const attachInput = (terminalId: string) => {
      const input = term.onData(data => pty.write(terminalId, data));
      offs.push(() => input.dispose());
    };

    (async () => {
      if (exitedWidgets.has(sessionKey)) {
        term.write(EXITED_NOTE);
        return;
      }
      let terminalId = sessionByWidget.get(sessionKey);
      if (terminalId) {
        watchExit(terminalId);
        // Listen before asking for the copy: output sent meanwhile waits here, and only what the copy does not
        // cover (by its number) is drawn after it. Neither lost nor drawn twice (a tab switch does this every time).
        let drawing = false;
        const waiting: [string, number][] = [];
        offs.push(pty.onData(terminalId, (data, seq) => {
          if (drawing) {
            term.write(data);
          } else {
            waiting.push([data, seq]);
          }
        }));
        const copy = await pty.buffer(terminalId);
        if (copy === undefined) {
          if (sessionByWidget.get(sessionKey) !== terminalId) {
            return; // its exit came first, and watchExit said so
          }
          // It ended while no view was attached.
          sessionByWidget.delete(sessionKey);
          exitedWidgets.add(sessionKey);
          if (!disposed) {
            term.write(EXITED_NOTE);
          }
          return;
        }
        if (!disposed) {
          term.write(copy.screen);
          waiting.filter(([, seq]) => seq > copy.seq).forEach(([data]) => term.write(data));
          drawing = true;
        }
        if (sessionByWidget.get(sessionKey) !== terminalId) {
          return; // it exited during the wait (watchExit showed that)
        }
        if (!disposed) {
          setError(null);
          attachInput(terminalId);
        }
        return;
      }
      // Taken by every view of the first tab (a running shell uses up its mark too), acted on only before a shell exists.
      // An AI write shows the widget; the tabs the user opens later are the user's own start.
      if (sessionKey === widgetId && takeRevealedByAi(widgetId) && !terminalId) {
        waitingForUser.add(sessionKey);
      }
      if (!terminalId && waitingForUser.has(sessionKey)) {
        // Shown by an AI write that ran without the confirm box: the user starts the shell (Restart Shell).
        term.write('[This terminal was shown by an AI action. Restart Shell starts the shell.]\r\n');
        return;
      }
      if (!terminalId) {
        const s = settingsRef.current;
        const res = await pty.create({
          cols: term.cols,
          rows: term.rows,
          shell: shellByKey.get(sessionKey) ?? (s.shell || undefined),
          cwd: s.cwd || undefined,
          command: s.startCommand || undefined,
        });
        if (!res.ok) {
          if (!disposed) {
            setError(res.message);
          }
          return;
        }
        if (disposed || deletedWidgets.has(sessionKey)) {
          // The view restarted or went away while the shell started (a newer view starts its own), or the widget was deleted.
          pty.kill(res.terminalId);
          return;
        }
        terminalId = res.terminalId;
        sessionByWidget.set(sessionKey, terminalId);
        ptyOfSessions = pty;
        watchExit(terminalId);
        // The view may have resized while the shell started (its size was read before).
        sendSize(terminalId);
      }
      if (!disposed) {
        const newId = terminalId;
        setError(null);
        offs.push(pty.onData(newId, data => term.write(data)));
        attachInput(newId);
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
      const terminalId = sessionByWidget.get(sessionKey);
      if (terminalId) {
        sendSize(terminalId);
      }
    };
    refitRef.current = resize;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    observer?.observe(el);

    return () => {
      disposed = true;
      termRef.current = null;
      refitRef.current = () => undefined;
      observer?.disconnect();
      offs.forEach(off => off());
      term.dispose();
    };
  }, [widgetId, sessionKey, pty, shell, generation]);

  const restart = useCallback(() => {
    // The same clean-up as for a deleted widget (the widget stays); then a new view starts a new shell.
    ptyOfSessions = pty;
    endShell(sessionKey);
    setGeneration(g => g + 1);
  }, [sessionKey, pty]);


  useEffect(() => {
    const items: ActionBarItems = [
      { id: 'RESTART', icon: restartSvg, title: 'Restart Shell', doAction: async () => restart() },
    ];
    updateActionBar(items);
  }, [updateActionBar, restart]);

  return (
    <div className={styles['terminal']} style={{ background: theme.background }}>
      {error && <div role="alert" className={styles['error']} style={{ color: theme.red }}>The shell could not start: {error}</div>}
      <div ref={hostRef} className={styles['host']}/>
    </div>
  );
}

/**
 * Tabs in the widget header (+ adds a shell, the menu next to it a chosen one, x closes one; no edit mode needed). Only the shown tab has a view;
 * the other shells keep running in main and their screen comes back from main's copy when selected.
 */
function TerminalTabs({id, settings, widgetApi, sharedState}: WidgetReactComponentProps<Settings>) {
  const {setHeaderTabs, pty} = widgetApi;
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  const [shells, setShells] = useState<ShellOption[]>(shellsKnown);
  useEffect(() => {
    let cancelled = false;
    shellsAsked ??= pty.shells().then(list => {
      shellsKnown = list;
      return list;
    }, () => {
      shellsAsked = undefined; // asked again by the next view
      return [];
    });
    shellsAsked.then(list => {
      if (!cancelled) {
        setShells(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pty]);
  // Titles come from main's copy of every shell, so a tab not shown is named too.
  useEffect(() => pty.onTitle((terminalId, title) => {
    const key = tabsOf(id).keys.find(k => sessionByWidget.get(k) === terminalId);
    if (key !== undefined && titleByKey.get(key) !== title) {
      titleByKey.set(key, title);
      refresh();
    }
  }), [id, pty, refresh]);

  useEffect(() => {
    const tabs = tabsOf(id);
    /** No shell: the Shell setting's. */
    const addTab = (shellPath?: string) => {
      const t = tabsOf(id);
      const key = `${id}#${t.next++}`;
      if (shellPath) {
        shellByKey.set(key, shellPath);
      }
      t.keys.push(key);
      t.active = t.keys.length - 1;
      refresh();
    };
    setHeaderTabs({
      tabs: tabs.keys.map(key => ({ label: titleByKey.get(key) || `Shell ${tabNumber(id, key)}` })),
      active: tabs.active,
      onSelect: index => {
        tabsOf(id).active = index;
        refresh();
      },
      onAdd: () => addTab(),
      addTitle: 'New Tab',
      addMenu: shells.map(o => ({ label: o.label, doAction: async () => addTab(o.shell) })),
      // The last tab has no x: a terminal keeps one shell at least.
      onClose: tabs.keys.length > 1 ? index => {
        const t = tabsOf(id);
        const [key] = t.keys.splice(index, 1);
        ptyOfSessions = pty;
        endShell(key);
        shellByKey.delete(key);
        if (index < t.active || t.active >= t.keys.length) {
          t.active = Math.max(0, t.active - 1);
        }
        refresh();
      } : undefined,
    });
  }, [id, version, setHeaderTabs, refresh, pty, shells]);
  useEffect(() => () => setHeaderTabs(null), [setHeaderTabs]);

  const tabs = tabsOf(id);
  const sessionKey = tabs.keys[Math.min(tabs.active, tabs.keys.length - 1)];
  // The terminal draws its own colors: the Theme setting, or the app's light or dark theme (Follow App).
  const theme = terminalThemes[settings.theme === 'app' ? uiThemeDataById[sharedState.uiTheme.themeId].kind : settings.theme];
  return <LiveTerminal key={sessionKey} widgetId={id} theme={theme} sessionKey={sessionKey} settings={settings} widgetApi={widgetApi}/>;
}

/**
 * The settings screen previews the widget with the same id: a live view there would attach
 * to the widget's shell and resize it to the preview's size.
 */
function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  if (props.env.isPreview) {
    return <div className={styles['preview']}>The shell runs in the widget.</div>;
  }
  return <TerminalTabs {...props}/>;
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
