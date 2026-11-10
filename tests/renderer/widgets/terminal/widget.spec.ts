/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, screen, waitFor } from '@testing-library/react';
import { forgetTerminalSession, widgetComp, resetTerminalSessions } from '@/widgets/terminal/widget';
import { createSettingsState, Settings } from '@/widgets/terminal/settings';
import { setupWidgetSut } from '@tests/widgets/setupSut';
import { ActionBarItems } from '@/widgets/appModules';
import { WidgetHeaderTabs } from '@/base/widgetApi';
import terminalType from '@/widgets/terminal';
import { markRevealedByAi, resetAiActivity } from '@/base/ai/aiActivity';

// xterm needs a real canvas/DOM layout; the widget is tested against a stand-in.
const terms: FakeTerminal[] = [];
class FakeTerminal {
  options: { fontSize?: number };
  cols = 80;
  rows = 24;
  written: string[] = [];
  disposed = false;
  private input?: (d: string) => void;
  constructor(o: { fontSize?: number } = {}) {
    this.options = { ...o };
    terms.push(this);
  }
  addons: unknown[] = [];
  loadAddon(a: unknown) {
    this.addons.push(a);
  }
  open(el: HTMLElement) {
    el.appendChild(document.createElement('canvas')); // where WebGL draws
  }
  write(d: string) {
    this.written.push(d);
  }
  onData(fn: (d: string) => void) {
    this.input = fn;
    return { dispose: () => { this.input = undefined; } };
  }
  type(d: string) {
    this.input?.(d);
  }
  keyHandler?: (e: KeyboardEvent) => boolean;
  attachCustomKeyEventHandler(fn: (e: KeyboardEvent) => boolean) {
    this.keyHandler = fn;
  }
  selection = false;
  hasSelection() {
    return this.selection;
  }
  focus() {
    return undefined;
  }
  dispose() {
    this.disposed = true;
  }
}
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn().mockImplementation((o: { fontSize?: number }) => new FakeTerminal(o)) }));
jest.mock('@xterm/addon-fit', () => ({ FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })) }));
const webgls: { lost?: () => void; disposed: boolean }[] = [];
class FakeWebgl {
  lost?: () => void;
  disposed = false;
  constructor() {
    webgls.push(this);
  }
  onContextLoss(fn: () => void) {
    this.lost = fn;
  }
  dispose() {
    this.disposed = true;
  }
}
jest.mock('@xterm/addon-webgl', () => ({ WebglAddon: jest.fn().mockImplementation(() => new FakeWebgl()) }));
/** The link addon's click handler, per view. */
const linkClicks: ((e: MouseEvent, uri: string) => void)[] = [];
jest.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: jest.fn().mockImplementation((fn: (e: MouseEvent, uri: string) => void) => {
    linkClicks.push(fn);
    return {};
  })
}));

function setupPty(createRes: { ok: true; terminalId: string } | { ok: false; message: string } = { ok: true, terminalId: 'T1' }) {
  const data = new Map<string, (d: string, seq?: number) => void>();
  const titleFns = new Set<(id: string, t: string) => void>();
  const exits = new Map<string, (c: number) => void>();
  const pty = {
    create: jest.fn(async () => createRes),
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    buffer: jest.fn(async (_id: string): Promise<{ screen: string; seq: number } | undefined> => undefined),
    onData: jest.fn((id: string, fn: (d: string, seq?: number) => void) => {
      data.set(id, fn);
      return () => data.delete(id);
    }),
    onTitle: jest.fn((fn: (id: string, t: string) => void) => {
      titleFns.add(fn);
      return () => titleFns.delete(fn);
    }),
    onExit: jest.fn((id: string, fn: (c: number) => void) => {
      exits.set(id, fn);
      return () => exits.delete(id);
    }),
    shells: jest.fn(async () => [{ label: 'PowerShell 7', shell: 'C:/pwsh/pwsh.exe' }, { label: 'Command Prompt', shell: 'cmd.exe' }]),
  };
  const title = (id: string, t: string) => titleFns.forEach(fn => fn(id, t));
  return { pty, data, exits, title };
}

const settings = (s: Partial<Settings> = {}) => createSettingsState(s);

beforeEach(() => {
  terms.length = 0;
  linkClicks.length = 0;
  resetTerminalSessions();
  resetAiActivity();
});

describe('Terminal widget', () => {
  it('starts a shell with the settings and the view size, and wires input and output', async () => {
    const { pty, data } = setupPty();
    setupWidgetSut(widgetComp, settings({ shell: 'pwsh.exe', cwd: 'C:/w', startCommand: 'claude' }), { mockWidgetApi: { pty } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    expect(pty.create).toHaveBeenCalledWith({ cols: 80, rows: 24, shell: 'pwsh.exe', cwd: 'C:/w', command: 'claude' });
    act(() => data.get('T1')?.('hello'));
    expect(terms[0].written).toContain('hello');
    terms[0].type('ls\r');
    expect(pty.write).toHaveBeenCalledWith('T1', 'ls\r');
  });

  it('keeps the shell running when the widget unmounts (a workflow unloaded by Memory Saver), and redraws on return', async () => {
    const { pty } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    expect(pty.kill).not.toHaveBeenCalled();
    expect(terms[0].disposed).toBe(true);
    pty.buffer.mockResolvedValueOnce({ screen: 'earlier output', seq: 0 });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written).toContain('earlier output'));
    expect(pty.create).toHaveBeenCalledTimes(1);
  });

  it('does not start or resize a shell in the settings preview (it shares the widget id)', async () => {
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, env: { area: 'shelf', isPreview: true } });
    expect(screen.getByText(/runs in the widget/)).toBeInTheDocument();
    expect(terms.length).toBe(0);
    expect(pty.create).not.toHaveBeenCalled();
  });

  it('ends the shell of a Terminal deleted while the shell starts (before its view unmounts)', async () => {
    const { pty } = setupPty();
    let finish: (v: { ok: true; terminalId: string }) => void = () => undefined;
    pty.create.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
    forgetTerminalSession('W1');
    await act(async () => finish({ ok: true, terminalId: 'ORPHAN' }));
    expect(pty.kill).toHaveBeenCalledWith('ORPHAN');
    expect(pty.onData).not.toHaveBeenCalledWith('ORPHAN', expect.any(Function));
  });

  it('ends a shell whose start finished after the view went away (restart or unmount while starting)', async () => {
    const { pty } = setupPty();
    let finish: (v: { ok: true; terminalId: string }) => void = () => undefined;
    pty.create.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
    await act(async () => finish({ ok: true, terminalId: 'LATE' }));
    expect(pty.kill).toHaveBeenCalledWith('LATE');
    await waitFor(() => expect(pty.onData).toHaveBeenCalledWith('T1', expect.any(Function)));
    expect(pty.onData).not.toHaveBeenCalledWith('LATE', expect.any(Function));
  });

  it('ends the shell when the widget is deleted', async () => {
    const { pty } = setupPty();
    const sut = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    sut.comp.unmount();
    terminalType.onDeleted?.('W1');
    expect(pty.kill).toHaveBeenCalledWith('T1');
  });

  it('after the shell exited, a new view does not start a shell by itself (Restart Shell does)', async () => {
    const { pty, exits } = setupPty();
    let items: ActionBarItems = [];
    const first = setupWidgetSut(widgetComp, settings({ startCommand: 'claude' }), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onExit).toHaveBeenCalled());
    act(() => exits.get('T1')?.(0));
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings({ startCommand: 'claude' }), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written.join('')).toContain('Restart Shell'));
    expect(pty.create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(items.length).toBe(1));
    await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
  });

  it('a shell that ended while the view was away is not started again by the new view', async () => {
    const { pty } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written.join('')).toContain('Restart Shell'));
    expect(pty.create).toHaveBeenCalledTimes(1);
  });

  it('the exit of a deleted widget\'s shell does not mark the deleted widget as exited', async () => {
    const { pty, exits } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onExit).toHaveBeenCalled());
    terminalType.onDeleted?.('W1');
    act(() => exits.get('T1')?.(0));
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
  });

  it('a shell that exits while the view mounts again is shown as ended', async () => {
    const { pty, exits } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    pty.buffer.mockImplementationOnce(async () => {
      exits.get('T1')?.(0);
      return { screen: 'earlier', seq: 0 };
    });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written.join('')).toContain('exited'));
  });

  it('says once that the shell ended when it exits while main reads its output (the read finds no shell)', async () => {
    const { pty, exits } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    pty.buffer.mockImplementationOnce(async () => {
      exits.get('T1')?.(0);
      return undefined;
    });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written.join('')).toContain('exited'));
    await act(async () => undefined);
    expect(terms[1].written.join('').match(/exited/g)).toHaveLength(1);
  });

  it('sends the view size again once the shell started (the view may have resized meanwhile)', async () => {
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    expect(pty.resize).toHaveBeenCalledWith('T1', 80, 24);
  });

  it('sends a size to the shell only when it changed (a drag fires the observer many times)', async () => {
    const { pty } = setupPty();
    let observed: () => void = () => undefined;
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(fn: () => void) { observed = fn; }
      observe() { return undefined; }
      disconnect() { return undefined; }
    };
    try {
      setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
      await waitFor(() => expect(pty.onData).toHaveBeenCalled());
      observed();
      observed();
      expect(pty.resize).toHaveBeenCalledTimes(1);
      terms[0].cols = 100;
      observed();
      expect(pty.resize).toHaveBeenLastCalledWith('T1', 100, 24);
      expect(pty.resize).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    }
  });

  it('does not start a shell by itself when an AI write without the confirm box showed it', async () => {
    const { pty } = setupPty();
    markRevealedByAi(['WIDGET-ID']);
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings({ startCommand: 'claude' }), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(terms[0].written.join('')).toContain('Restart Shell'));
    expect(pty.create).not.toHaveBeenCalled();
    await waitFor(() => expect(items.length).toBe(1));
    await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pty.onData).toHaveBeenCalledWith('T1', expect.any(Function))); // the shell is shown
    expect(pty.kill).not.toHaveBeenCalledWith('T1');
  });

  it('keeps waiting through a second mount of the view (until the user starts the shell)', async () => {
    const { pty } = setupPty();
    markRevealedByAi(['W1']);
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[0].written.join('')).toContain('Restart Shell'));
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[1].written.join('')).toContain('Restart Shell'));
    expect(pty.create).not.toHaveBeenCalled();
  });

  it('starts its shell as usual when an AI write showed other widgets only', async () => {
    const { pty } = setupPty();
    markRevealedByAi(['SOME-OTHER-WIDGET']);
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
  });

  it('a mark on a Terminal whose shell runs is used up, so a later Restart Shell starts at once', async () => {
    const { pty } = setupPty();
    let items: ActionBarItems = [];
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    markRevealedByAi(['W1']);
    pty.buffer.mockResolvedValueOnce({ screen: 'earlier', seq: 0 });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } }, widgetId: 'W1' });
    await waitFor(() => expect(items.length).toBe(1));
    await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
  });

  it('shows the exit code when the shell ends', async () => {
    const { pty, exits } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(pty.onExit).toHaveBeenCalled());
    act(() => exits.get('T1')?.(3));
    expect(terms[0].written.join('')).toContain('exited with code 3');
  });

  it('shows why the shell could not start', async () => {
    const { pty } = setupPty({ ok: false, message: 'File not found' });
    setupWidgetSut(widgetComp, settings({ shell: 'nope.exe' }), { mockWidgetApi: { pty } });
    expect(await screen.findByText(/File not found/)).toBeInTheDocument();
  });

  it('draws with WebGL once the view is open, and goes back to the DOM renderer when the WebGL context is lost', async () => {
    webgls.length = 0;
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(webgls).toHaveLength(1));
    expect(terms[0].addons).toContain(webgls[0]);
    webgls[0].lost?.();
    expect(webgls[0].disposed).toBe(true);
  });

  it('releases its WebGL context when the view goes (Chromium keeps only a few; the oldest would be lost)', async () => {
    webgls.length = 0;
    const loseContext = jest.fn();
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ getExtension: () => ({ loseContext }) }) as unknown as RenderingContext);
    const { pty } = setupPty();
    const { comp } = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(webgls).toHaveLength(1));
    comp.unmount();
    expect(webgls[0].disposed).toBe(true);
    expect(loseContext).toHaveBeenCalled();
    getContext.mockRestore();
  });

  it('works without WebGL (the addon cannot start)', async () => {
    const { WebglAddon } = jest.requireMock('@xterm/addon-webgl') as { WebglAddon: jest.Mock };
    WebglAddon.mockImplementationOnce(() => { throw new Error('no WebGL'); });
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
  });

  it('draws a re-attached shell from its screen copy, then only the output the copy does not cover', async () => {
    const { pty, data } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    first.comp.unmount();
    let answer: (v: { screen: string; seq: number }) => void = () => undefined;
    pty.buffer.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(pty.buffer).toHaveBeenCalledTimes(1));
    act(() => data.get('T1')?.('old', 1)); // sent while main made the copy: in the copy
    act(() => data.get('T1')?.('new', 3)); // after the copy
    await act(async () => answer({ screen: 'SCREEN', seq: 2 }));
    expect(terms[1].written).toEqual(['SCREEN', 'new']);
  });

  it('pastes with Ctrl+V and copies a selection with Ctrl+C, as Windows Terminal does (the keys are not sent to the shell)', async () => {
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty } });
    await waitFor(() => expect(terms[0].keyHandler).toBeDefined());
    const key = (k: Partial<KeyboardEvent>) => terms[0].keyHandler?.({ type: 'keydown', ...k } as KeyboardEvent);
    expect(key({ ctrlKey: true, key: 'v' })).toBe(false); // the browser pastes into xterm
    expect(key({ ctrlKey: true, shiftKey: true, key: 'V' })).toBe(false);
    expect(key({ ctrlKey: true, key: 'c' })).toBe(true); // no selection: ^C to the shell
    terms[0].selection = true;
    expect(key({ ctrlKey: true, key: 'c' })).toBe(false); // the browser copies the selection
    expect(key({ key: 'a' })).toBe(true);
  });

  describe('tabs', () => {
    function setupTabs(widgetId = 'W1') {
      const { pty, title } = setupPty();
      let n = 0;
      pty.create.mockImplementation(async () => ({ ok: true as const, terminalId: `T${++n}` }));
      pty.buffer.mockResolvedValue({ screen: '', seq: 0 }); // the shells run: a view that attaches again gets their screen
      let header: WidgetHeaderTabs | null = null;
      let calls = 0;
      const setHeaderTabs = (t: WidgetHeaderTabs | null) => {
        header = t;
        calls++;
      };
      const view = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, setHeaderTabs }, widgetId });
      const tabs = () => header as WidgetHeaderTabs | null;
      return { pty, tabs, view, setHeaderTabs, title, headerCalls: () => calls };
    }

    it('shows one tab with + and no x (a terminal keeps one shell at least)', async () => {
      const { tabs } = setupTabs();
      await waitFor(() => expect(tabs()?.tabs.map(t => t.label)).toEqual(['Shell 1']));
      expect(tabs()?.onAdd).toBeDefined();
      expect(tabs()?.onClose).toBeUndefined();
    });

    it('+ opens a new tab with its own shell; the first tab\'s shell keeps running and comes back on select', async () => {
      const { pty, tabs } = setupTabs();
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
      await act(async () => { tabs()?.onAdd?.(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
      expect(tabs()?.tabs.map(t => t.label)).toEqual(['Shell 1', 'Shell 2']);
      expect(tabs()?.active).toBe(1);
      expect(pty.kill).not.toHaveBeenCalled();
      await act(async () => { tabs()?.onSelect(0); });
      await waitFor(() => expect(pty.buffer).toHaveBeenCalledWith('T1')); // its screen is drawn again
      expect(pty.create).toHaveBeenCalledTimes(2);
    });

    it('x closes a tab and ends its shell', async () => {
      const { pty, tabs } = setupTabs();
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
      await act(async () => { tabs()?.onAdd?.(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
      await act(async () => { tabs()?.onClose?.(0); });
      expect(pty.kill).toHaveBeenCalledWith('T1');
      expect(tabs()?.tabs.map(t => t.label)).toEqual(['Shell 2']);
      expect(tabs()?.active).toBe(0);
      expect(tabs()?.onClose).toBeUndefined();
    });

    it('keeps its tabs when the view mounts again (Memory Saver), and a delete ends every tab\'s shell', async () => {
      const { pty, tabs, view, setHeaderTabs } = setupTabs();
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
      await act(async () => { tabs()?.onAdd?.(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
      view.comp.unmount();
      setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, setHeaderTabs }, widgetId: 'W1' });
      await waitFor(() => expect(tabs()?.tabs.map(t => t.label)).toEqual(['Shell 1', 'Shell 2']));
      expect(pty.create).toHaveBeenCalledTimes(2);
      forgetTerminalSession('W1');
      expect(pty.kill).toHaveBeenCalledWith('T1');
      expect(pty.kill).toHaveBeenCalledWith('T2');
    });

    it('the menu next to + opens a tab with a shell found on this computer, and Restart Shell keeps that shell', async () => {
      const { pty } = setupPty();
      let n = 0;
      pty.create.mockImplementation(async () => ({ ok: true as const, terminalId: `T${++n}` }));
      let header: WidgetHeaderTabs | null = null;
      let items: ActionBarItems = [];
      setupWidgetSut(widgetComp, settings({ shell: 'bash' }), {
        mockWidgetApi: { pty, setHeaderTabs: (t: WidgetHeaderTabs | null) => { header = t; }, updateActionBar: (i: ActionBarItems) => { items = i; } }
      });
      const tabs = () => header as WidgetHeaderTabs | null;
      await waitFor(() => expect(tabs()?.addMenu?.map(i => i.label)).toEqual(['PowerShell 7', 'Command Prompt']));
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
      await act(async () => { await tabs()?.addMenu?.[1].doAction?.(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
      expect(pty.create).toHaveBeenLastCalledWith(expect.objectContaining({ shell: 'cmd.exe' }));
      expect(tabs()?.active).toBe(1);
      await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(3));
      expect(pty.create).toHaveBeenLastCalledWith(expect.objectContaining({ shell: 'cmd.exe' }));
      await act(async () => { tabs()?.onAdd?.(); }); // + uses the setting
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(4));
      expect(pty.create).toHaveBeenLastCalledWith(expect.objectContaining({ shell: 'bash' }));
    });

    it('asks main for the shell list once (it does not change), and a view that mounts again has the menu at once', async () => {
      const { pty } = setupPty();
      let header: WidgetHeaderTabs | null = null;
      const setHeaderTabs = (t: WidgetHeaderTabs | null) => {
        header = t;
      };
      const menu = () => (header as WidgetHeaderTabs | null)?.addMenu;
      const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, setHeaderTabs }, widgetId: 'W1' });
      await waitFor(() => expect(menu()).toHaveLength(2));
      first.comp.unmount();
      header = null;
      setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, setHeaderTabs }, widgetId: 'W2' });
      expect(menu()).toHaveLength(2);
      expect(pty.shells).toHaveBeenCalledTimes(1);
    });

    it('names a tab by the title its shell sets, also while another tab is shown (and once per new title)', async () => {
      const { pty, tabs, title, headerCalls } = setupTabs();
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(1));
      await act(async () => { tabs()?.onAdd?.(); });
      await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
      act(() => title('T1', 'Claude Code')); // tab 1 is not shown
      await waitFor(() => expect(tabs()?.tabs.map(t => t.label)).toEqual(['Claude Code', 'Shell 2']));
      const calls = headerCalls();
      act(() => title('T1', 'Claude Code'));
      expect(headerCalls()).toBe(calls); // the same title again draws nothing
    });
  });

  it('opens a link in the browser on Ctrl+click only (a plain click selects text, as in Windows Terminal)', async () => {
    const { pty } = setupPty();
    const openExternalUrl = jest.fn(async () => undefined);
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, shell: { openExternalUrl } } });
    await waitFor(() => expect(linkClicks).toHaveLength(1));
    linkClicks[0](new MouseEvent('click'), 'https://example.com');
    expect(openExternalUrl).not.toHaveBeenCalled();
    linkClicks[0](new MouseEvent('click', { ctrlKey: true }), 'https://example.com');
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('zooms with Ctrl+= / Ctrl+- / Ctrl+wheel and goes back to the font size setting with Ctrl+0 (keys not sent to the shell)', async () => {
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings({ fontSize: 14 }), { mockWidgetApi: { pty } });
    await waitFor(() => expect(terms[0].keyHandler).toBeDefined());
    const term = terms[0];
    expect(term.options.fontSize).toBe(14);
    const key = (k: Partial<KeyboardEvent>) => act(() => { expect(term.keyHandler?.({ type: 'keydown', ctrlKey: true, ...k } as KeyboardEvent)).toBe(false); });
    key({ key: '=' });
    key({ key: '+', shiftKey: true });
    expect(term.options.fontSize).toBe(16);
    key({ key: '-' });
    expect(term.options.fontSize).toBe(15);
    const host = document.querySelector('canvas')?.parentElement as HTMLElement;
    const wheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { host.dispatchEvent(wheel); });
    expect(wheel.defaultPrevented).toBe(true); // no page zoom
    expect(term.options.fontSize).toBe(16);
    act(() => { host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); }); // a plain wheel scrolls
    expect(term.options.fontSize).toBe(16);
    // A touchpad pinch sends many small steps: one size per notch's distance, not one per event.
    const pinch = (deltaY: number) => host.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true }));
    act(() => {
      for (let i = 0; i < 9; i++) {
        pinch(10);
      }
    });
    expect(term.options.fontSize).toBe(16);
    act(() => { pinch(10); });
    expect(term.options.fontSize).toBe(15);
    act(() => { host.dispatchEvent(new WheelEvent('wheel', { deltaX: 100, ctrlKey: true, bubbles: true, cancelable: true })); }); // sideways: no zoom
    expect(term.options.fontSize).toBe(15);
    expect(term.keyHandler?.({ type: 'keydown', ctrlKey: true, shiftKey: true, key: '_' } as KeyboardEvent)).toBe(true); // Ctrl+_ still sends ^_
    key({ key: '0' });
    expect(term.options.fontSize).toBe(14);
  });

  it('zooms out from the size shown when the zoom went past the largest size (one Ctrl+- always shows a change)', async () => {
    const { pty } = setupPty();
    setupWidgetSut(widgetComp, settings({ fontSize: 46 }), { mockWidgetApi: { pty } });
    await waitFor(() => expect(terms[0].keyHandler).toBeDefined());
    const key = (k: string) => act(() => { terms[0].keyHandler?.({ type: 'keydown', ctrlKey: true, key: k } as KeyboardEvent); });
    for (let i = 0; i < 5; i++) {
      key('=');
    }
    expect(terms[0].options.fontSize).toBe(48);
    key('-');
    expect(terms[0].options.fontSize).toBe(47);
  });

  it('forgets the zoom of a deleted widget', async () => {
    const { pty } = setupPty();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[0].keyHandler).toBeDefined());
    act(() => { terms[0].keyHandler?.({ type: 'keydown', ctrlKey: true, key: '=' } as KeyboardEvent); });
    first.comp.unmount();
    forgetTerminalSession('W1');
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms).toHaveLength(2));
    expect(terms[1].options.fontSize).toBe(13);
  });

  it('keeps the zoom for the widget when the view mounts again (another tab, Memory Saver)', async () => {
    const { pty } = setupPty();
    pty.buffer.mockResolvedValue({ screen: '', seq: 0 });
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms[0].keyHandler).toBeDefined());
    act(() => { terms[0].keyHandler?.({ type: 'keydown', ctrlKey: true, key: '=' } as KeyboardEvent); });
    first.comp.unmount();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty }, widgetId: 'W1' });
    await waitFor(() => expect(terms).toHaveLength(2));
    expect(terms[1].options.fontSize).toBe(14);
  });

  it('has only Restart Shell in the action bar (no button types commands into the shell)', async () => {
    const { pty } = setupPty();
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(items.map(i => i.id)).toEqual(['RESTART']));
    expect(pty.write).not.toHaveBeenCalled();
  });

});
