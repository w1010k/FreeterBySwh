/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AgentProcess, createAiAgentRunner } from '@/application/ai/aiAgentRunner';
import { AgentEvent, AgentTool } from '@common/ai/agent';

class FakeProcess extends EventEmitter implements AgentProcess {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  written = '';
  constructor() {
    super();
    this.stdin.on('data', d => {
      this.written += String(d);
    });
  }
  line(o: object) {
    this.stdout.write(JSON.stringify(o) + '\n');
  }
  exit(code: number) {
    this.emit('exit', code);
  }
}

const tick = () => new Promise(r => setImmediate(r));

function setup(programs: Partial<Record<AgentTool, string>> = { claude: 'C:/claude.exe', codex: 'C:/codex.cmd' }) {
  const procs: FakeProcess[] = [];
  const events: [string, AgentEvent][] = [];
  const spawn = jest.fn((_program: string, _args: string[]) => {
    const p = new FakeProcess();
    procs.push(p);
    return p;
  });
  const kill = jest.fn((p: AgentProcess) => (p as FakeProcess).exit(1));
  let n = 0;
  const runner = createAiAgentRunner({
    findProgram: tool => programs[tool],
    spawn,
    kill,
    emit: (id, e) => events.push([id, e]),
    argsFor: (tool, o) => [tool, o.sessionId ?? '-', o.model ?? '', o.effort ?? ''],
    newId: () => `conv-${++n}`,
    timeoutMs: 1000,
  });
  return { runner, procs, events, spawn, kill };
}

describe('createAiAgentRunner', () => {
  afterEach(() => jest.useRealTimers());

  it('detects installed CLIs', () => {
    expect(setup({ claude: 'c' }).runner.detect()).toEqual({ claude: true, codex: false });
  });

  it('starts a conversation, sends the prompt on stdin and relays events', async () => {
    const { runner, procs, events, spawn } = setup();
    expect(runner.send(null, { tool: 'claude', prompt: 'hello', model: 'haiku' })).toEqual({ ok: true, conversationId: 'conv-1' });
    expect(spawn).toHaveBeenCalledWith('C:/claude.exe', ['claude', '-', 'haiku', '']);
    await tick();
    expect(procs[0].written).toBe('hello');
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    procs[0].exit(0);
    expect(events).toEqual([['conv-1', { type: 'text', text: 'Hi' }], ['conv-1', { type: 'done', sessionId: 's1', costUsd: undefined }]]);
  });

  it('resumes the next turn with the session id of the last one', async () => {
    const { runner, procs, spawn } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    procs[0].line({ type: 'thread.started', thread_id: 't9' });
    procs[0].line({ type: 'turn.completed' });
    await tick();
    procs[0].exit(0);
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toEqual({ ok: true, conversationId: 'conv-1' });
    expect(spawn).toHaveBeenLastCalledWith('C:/codex.cmd', ['codex', 't9', '', '']);
  });

  it('refuses a second turn while one runs, a tool switch, an unknown conversation and a missing CLI', () => {
    const { runner } = setup({ claude: 'c' });
    runner.send(null, { tool: 'claude', prompt: 'a' });
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send('nope', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send(null, { tool: 'codex', prompt: 'b' })).toEqual({ ok: false, message: 'codex is not installed (not found on PATH)' });
  });

  it('rejects an unsafe model name or an empty prompt', () => {
    const { runner, spawn } = setup();
    expect(runner.send(null, { tool: 'claude', prompt: 'a', model: 'x & del' })).toMatchObject({ ok: false });
    expect(runner.send(null, { tool: 'claude', prompt: '' })).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports the CLI\'s own message when it exits without finishing (e.g. not logged in)', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].stderr.write('Please run /login\n');
    await tick();
    procs[0].exit(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Please run /login' }]]);
  });

  it('cancel kills the process and reports it', async () => {
    const { runner, kill, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    runner.cancel('conv-1');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled' }]]);
  });

  it('kills a turn that runs past the time limit', () => {
    jest.useFakeTimers();
    const { runner, kill, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    jest.advanceTimersByTime(1000);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'No answer in time; stopped' }]]);
  });

  it('ends the turn at its final event even if the CLI is slow to exit, and kills a CLI that lingers', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    procs[0].line({ type: 'thread.started', thread_id: 't1' });
    procs[0].line({ type: 'turn.completed' });
    await tick();
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: true });
    jest.advanceTimersByTime(5000);
    expect(kill).toHaveBeenCalledWith(procs[0]);
  });

  it('stopAll kills every running turn', () => {
    const { runner, kill } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    runner.send(null, { tool: 'codex', prompt: 'b' });
    runner.stopAll();
    expect(kill).toHaveBeenCalledTimes(2);
  });
});
