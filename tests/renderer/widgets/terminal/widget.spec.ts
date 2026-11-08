/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, screen, waitFor } from '@testing-library/react';
import { forgetTerminalSession, widgetComp, resetTerminalSessions } from '@/widgets/terminal/widget';
import { createSettingsState, Settings } from '@/widgets/terminal/settings';
import { setupWidgetSut } from '@tests/widgets/setupSut';
import { ActionBarItems } from '@/widgets/appModules';
import terminalType from '@/widgets/terminal';
import { markRevealedByAi, resetAiActivity } from '@/base/ai/aiActivity';

// xterm needs a real canvas/DOM layout; the widget is tested against a stand-in.
const terms: FakeTerminal[] = [];
class FakeTerminal {
  cols = 80;
  rows = 24;
  written: string[] = [];
  disposed = false;
  private input?: (d: string) => void;
  constructor() {
    terms.push(this);
  }
  loadAddon() {
    return undefined;
  }
  open() {
    return undefined;
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
  focus() {
    return undefined;
  }
  dispose() {
    this.disposed = true;
  }
}
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn().mockImplementation(() => new FakeTerminal()) }));
jest.mock('@xterm/addon-fit', () => ({ FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })) }));

function setupPty(createRes: { ok: true; terminalId: string } | { ok: false; message: string } = { ok: true, terminalId: 'T1' }) {
  const data = new Map<string, (d: string) => void>();
  const exits = new Map<string, (c: number) => void>();
  const pty = {
    create: jest.fn(async () => createRes),
    write: jest.fn(),
    resize: jest.fn(),
    kill: jest.fn(),
    buffer: jest.fn(async (_id: string): Promise<string | undefined> => undefined),
    onData: jest.fn((id: string, fn: (d: string) => void) => {
      data.set(id, fn);
      return () => data.delete(id);
    }),
    onExit: jest.fn((id: string, fn: (c: number) => void) => {
      exits.set(id, fn);
      return () => exits.delete(id);
    }),
  };
  return { pty, data, exits };
}

const settings = (s: Partial<Settings> = {}) => createSettingsState(s);

beforeEach(() => {
  terms.length = 0;
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
    pty.buffer.mockResolvedValueOnce('earlier output');
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

  it('Start Claude Code types nothing when a program (not the shell prompt) is in front, and says so', async () => {
    const { pty, data } = setupPty();
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    act(() => data.get('T1')?.('\x1b[2m? for shortcuts\x1b[0m'));
    act(() => { items.find(i => i.id === 'START-CLAUDE')?.doAction(); });
    expect(pty.write).not.toHaveBeenCalled();
    expect(terms[0].written.join('')).toContain('program');
    act(() => data.get('T1')?.('\r\nuser@host:~$ '));
    act(() => { items.find(i => i.id === 'START-CLAUDE')?.doAction(); });
    expect(pty.write).toHaveBeenCalledWith('T1', 'claude\r');
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
    await waitFor(() => expect(items.length).toBe(3));
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
      return 'earlier';
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

  it('Start buttons do not type into a language prompt (Python, Node)', async () => {
    const { pty, data } = setupPty();
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    await waitFor(() => expect(items.length).toBe(3));
    for (const prompt of ['>>> ', '> ', '... ', 'irb(main):001:0> ', '>> ']) { // '>>': PowerShell's unfinished input
      act(() => data.get('T1')?.('\r\n' + prompt));
      act(() => { items.find(i => i.id === 'START-CLAUDE')?.doAction(); });
    }
    expect(pty.write).not.toHaveBeenCalled();
  });

  it('does not start a shell by itself when an AI write without the confirm box showed it', async () => {
    const { pty } = setupPty();
    markRevealedByAi(['WIDGET-ID']);
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings({ startCommand: 'claude' }), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(terms[0].written.join('')).toContain('Restart Shell'));
    expect(pty.create).not.toHaveBeenCalled();
    await waitFor(() => expect(items.length).toBe(3));
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
    pty.buffer.mockResolvedValueOnce('earlier');
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } }, widgetId: 'W1' });
    await waitFor(() => expect(items.length).toBe(3));
    await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
  });

  it('Start buttons on a Terminal that waits for the user say to start the shell first', async () => {
    const { pty } = setupPty();
    markRevealedByAi(['W1']);
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } }, widgetId: 'W1' });
    await waitFor(() => expect(items.length).toBe(3));
    await waitFor(() => expect(terms[0].written.join('')).toContain('Restart Shell'));
    const before = terms[0].written.length;
    act(() => { items.find(i => i.id === 'START-CLAUDE')?.doAction(); });
    expect(terms[0].written.slice(before).join('')).toMatch(/Restart Shell/);
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

  it('has action bar items to restart the shell and to start Claude Code or Codex in it', async () => {
    const { pty, data } = setupPty();
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { pty, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    await waitFor(() => expect(pty.onData).toHaveBeenCalled());
    await waitFor(() => expect(items.length).toBe(3));
    act(() => data.get('T1')?.('PS C:\\work> '));
    act(() => { items.find(i => i.id === 'START-CLAUDE')?.doAction(); });
    expect(pty.write).toHaveBeenCalledWith('T1', 'claude\r');
    act(() => { items.find(i => i.id === 'START-CODEX')?.doAction(); });
    expect(pty.write).toHaveBeenCalledWith('T1', 'codex\r');
    await act(async () => { items.find(i => i.id === 'RESTART')?.doAction(); });
    expect(pty.kill).toHaveBeenCalledWith('T1');
    await waitFor(() => expect(pty.create).toHaveBeenCalledTimes(2));
  });
});
