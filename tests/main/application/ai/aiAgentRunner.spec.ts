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
    this.emit('close', code);
  }
}

const tick = () => new Promise(r => setImmediate(r));
// The main test target has no Array.prototype.at.
const last = <T>(a: T[]): T => a[a.length - 1];
/** What the runner wrote to the process, one JSON message per line. */
const sent = (p: FakeProcess) => p.written.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const codexThread = (p: FakeProcess, threadId = 'T1') => p.line({ id: 2, result: { thread: { id: threadId } } });
const codexTurn = (p: FakeProcess, turnId: string) => p.line({ id: last(sent(p).filter(m => m.method === 'turn/start')).id, result: { turn: { id: turnId } } });
const codexDone = (p: FakeProcess, turnId: string, threadId = 'T1') =>
  p.line({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed' } } });

function setup(programs: Partial<Record<AgentTool, string>> = { claude: 'C:/claude.exe', codex: 'C:/codex.cmd' }, timeoutMs = 1000, withSession = false) {
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
    // 'session' events (a conversation id became known) are left out unless a test asks for them.
    emit: (id, e) => (withSession || e.type !== 'session' ? events.push([id, e]) : 0),
    argsFor: (tool, o) => [tool, o.sessionId ?? '-', o.model ?? '', o.effort ?? ''],
    newId: () => `conv-${++n}`,
    timeoutMs,
    idleMs: 60000,
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
    expect(JSON.parse(procs[0].written)).toEqual({ type: 'user', message: { role: 'user', content: 'hello' } });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } } });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    procs[0].exit(0);
    expect(events).toEqual([['conv-1', { type: 'textDelta', text: 'Hi' }], ['conv-1', { type: 'done', sessionId: 's1', costUsd: undefined }]]);
  });

  it('keeps one Codex app-server process: holds the first prompt until its thread started, then sends turns on it', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    await tick();
    expect(sent(procs[0]).map(m => m.method)).toEqual(['initialize', 'initialized', 'thread/start']);
    codexThread(procs[0]);
    await tick();
    expect(last(sent(procs[0]))).toMatchObject({ method: 'turn/start', params: { threadId: 'T1', input: [{ text: 'a' }] } });
    codexTurn(procs[0], 'U1');
    procs[0].line({ method: 'item/agentMessage/delta', params: { threadId: 'T1', turnId: 'U1', itemId: 'i', delta: 'Hi' } });
    codexDone(procs[0], 'U1');
    await tick();
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: true });
    await tick();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(last(sent(procs[0]))).toMatchObject({ method: 'turn/start', params: { input: [{ text: 'b' }] } });
    expect(events).toEqual([['conv-1', { type: 'textDelta', text: 'Hi' }], ['conv-1', { type: 'done', sessionId: 'T1' }]]);
  });

  it('resumes the Codex thread in a new process (after an exit, idle stop or option change)', async () => {
    const { runner, procs, spawn } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0], 'T9');
    await tick();
    codexTurn(procs[0], 'U1');
    codexDone(procs[0], 'U1', 'T9');
    await tick();
    procs[0].exit(0);
    runner.send('conv-1', { tool: 'codex', prompt: 'b' });
    await tick();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(sent(procs[1])[2]).toMatchObject({ method: 'thread/resume', params: { threadId: 'T9' } });
  });

  it('Stop interrupts a Codex turn inside the CLI and keeps the process for the next turn', async () => {
    const { runner, procs, spawn, kill, events } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    await tick();
    runner.cancel('conv-1');
    expect(last(sent(procs[0]))).toMatchObject({ method: 'turn/interrupt', params: { threadId: 'T1', turnId: 'U1' } });
    expect(kill).not.toHaveBeenCalled();
    procs[0].line({ method: 'item/agentMessage/delta', params: { threadId: 'T1', turnId: 'U1', itemId: 'i', delta: 'late' } });
    await tick();
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled', sessionId: 'T1' }]]);
  });

  it('a prompt held behind a Codex turn that does not end ends the process after a while (no endless wait)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill, events } = setup(undefined, 600000);
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    procs[0].line({ method: 'error', params: { error: { message: 'stream disconnected' }, willRetry: false, threadId: 'T1', turnId: 'U1' } });
    await tick();
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: true });
    expect(sent(procs[0]).filter(m => m.method === 'turn/start')).toHaveLength(1); // held
    jest.advanceTimersByTime(11000);
    expect(kill).toHaveBeenCalled();
    expect(last(events)).toEqual(['conv-1', expect.objectContaining({ type: 'error', message: expect.stringMatching(/send your message again/) })]);
    jest.useRealTimers();
  });

  it('the give-up time of a held prompt counts from that prompt, not from an earlier one with the same text', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill } = setup(undefined, 600000);
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    procs[0].line({ method: 'error', params: { error: { message: 'x' }, willRetry: false, threadId: 'T1', turnId: 'U1' } });
    await tick();
    runner.send('conv-1', { tool: 'codex', prompt: 'continue' });
    runner.cancel('conv-1');
    jest.advanceTimersByTime(4000);
    runner.send('conv-1', { tool: 'codex', prompt: 'continue' });
    jest.advanceTimersByTime(7000); // 11 s after the first, 7 s after this one
    expect(kill).not.toHaveBeenCalled();
    jest.advanceTimersByTime(4000);
    expect(kill).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('answers a request from the CLI so the turn does not wait on it', async () => {
    const { runner, procs } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    procs[0].line({ id: 50, method: 'item/commandExecution/requestApproval', params: {} });
    await tick();
    expect(last(sent(procs[0]))).toMatchObject({ id: 50, error: { code: -32601 } });
  });

  it('refuses a second turn while one runs, a tool switch, an unknown conversation and a missing CLI', () => {
    const { runner } = setup({ claude: 'c' });
    runner.send(null, { tool: 'claude', prompt: 'a' });
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send('nope', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false });
    expect(runner.send(null, { tool: 'codex', prompt: 'b' })).toEqual({ ok: false, message: 'codex is not installed (not found on PATH)' });
  });

  it('rejects a model or a conversation id that is not a string (values from the page)', () => {
    const { runner, spawn } = setup();
    expect(runner.send(null, { tool: 'codex', prompt: 'a', model: ['gpt-5'] as never })).toEqual({ ok: false, message: 'Invalid model name' });
    expect(runner.send(null, { tool: 'claude', prompt: 'a', resume: 12345 as never })).toEqual({ ok: false, message: 'Invalid conversation id to resume' });
    expect(spawn).not.toHaveBeenCalled();
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

  it('cancel stops a Claude turn inside the process and reports it', async () => {
    const { runner, procs, kill, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    await tick();
    runner.cancel('conv-1');
    await tick();
    expect(kill).not.toHaveBeenCalled();
    expect(last(sent(procs[0]))).toMatchObject({ type: 'control_request', request: { subtype: 'interrupt' } });
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled' }]]);
  });

  it('a Stop that never ends inside the CLI still ends the process after a while, also after a held send was stopped', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill } = setup(undefined, 600000);
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    await tick();
    runner.cancel('conv-1'); // interrupt sent
    runner.send('conv-1', { tool: 'claude', prompt: 'b' }); // held behind the Stop
    runner.cancel('conv-1'); // Stop on the held one
    jest.advanceTimersByTime(11000);
    expect(kill).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('kills a turn that runs past the time limit', () => {
    jest.useFakeTimers();
    const { runner, kill, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    jest.advanceTimersByTime(1000);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'No answer in time; stopped' }]]);
  });

  it('ends the turn at a failure reported in the output, once, and lets the next turn start', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    procs[0].line({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed', error: { message: 'quota' } } } });
    await tick();
    expect(runner.send('conv-1', { tool: 'codex', prompt: 'b' })).toMatchObject({ ok: true });
    expect(events).toEqual([['conv-1', { type: 'error', message: 'quota', sessionId: 'T1' }]]);
  });

  it('judges the turn when the output is complete, even if the exit event came before the last line', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].emit('exit', 0);
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    procs[0].emit('close', 0);
    expect(events).toEqual([['conv-1', { type: 'done', sessionId: 's1', costUsd: undefined }]]);
  });

  it('sends nothing more for a turn after it was cancelled', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    runner.cancel('conv-1');
    procs[0].line({ type: 'assistant', message: { content: [{ type: 'text', text: 'late' }] } });
    await tick();
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled' }]]);
  });

  it('survives a CLI that exits before reading the whole prompt (stdin write error)', () => {
    const { runner, procs } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    expect(() => procs[0].stdin.emit('error', new Error('write EOF'))).not.toThrow();
  });

  it('keeps one Claude Code process for the conversation and sends each prompt as a stream-json line', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: true });
    await tick();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(procs[0].written.trim().split('\n').map(l => JSON.parse(l).message.content)).toEqual(['a', 'b']);
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    expect(events.filter(([, e]) => e.type === 'done')).toHaveLength(2);
  });

  it('warm starts the Claude Code process before the first prompt, and the prompt goes to it', async () => {
    const { runner, procs, spawn } = setup();
    expect(runner.warm(null, { tool: 'claude', model: 'haiku' })).toEqual({ ok: true, conversationId: 'conv-1' });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(runner.warm('conv-1', { tool: 'claude', model: 'haiku' })).toMatchObject({ ok: true });
    runner.send('conv-1', { tool: 'claude', prompt: 'a', model: 'haiku' });
    await tick();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(procs[0].written).toContain('"a"');
  });

  it('warm starts the Codex process too, and checks its input', () => {
    const { runner, spawn } = setup();
    expect(runner.warm(null, { tool: 'codex' })).toEqual({ ok: true, conversationId: 'conv-1' });
    expect(runner.warm(null, { tool: 'claude', model: 'x & y' })).toMatchObject({ ok: false });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('ends an idle Claude Code process, and the next turn resumes the session in a new one', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, spawn, kill } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    jest.advanceTimersByTime(60000);
    expect(kill).toHaveBeenCalledWith(procs[0]);
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', 's1', '', '']);
  });

  it('starts a new process (resuming the session) when the model or effort changes', async () => {
    const { runner, procs, spawn, kill } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'b', effort: 'high' });
    expect(kill).toHaveBeenCalledWith(procs[0]);
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', 's1', '', 'high']);
  });

  it('after a Claude cancel, the next prompt waits for the stopped turn to end, then goes to the same process', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    await tick();
    runner.cancel('conv-1');
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    await tick();
    expect(sent(procs[0]).filter(m => m.type === 'user')).toHaveLength(1);
    procs[0].line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 1, session_id: 's1' });
    await tick();
    expect(sent(procs[0]).filter(m => m.type === 'user').map(m => m.message.content)).toEqual(['a', 'b']);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled', sessionId: 's1' }]]);
  });

  it('a Claude Code process that exits while idle is started again for the next turn, silently', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    procs[0].exit(0);
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(events.map(([, e]) => e.type)).toEqual(['done']);
  });

  it('end forgets the conversation and ends its process', () => {
    const { runner, kill, events } = setup();
    runner.warm(null, { tool: 'claude' });
    runner.end('conv-1');
    expect(kill).toHaveBeenCalledTimes(1);
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'a' })).toMatchObject({ ok: false, message: 'Unknown conversation' });
    expect(events).toEqual([]);
  });

  it('does not use a Claude Code process again once it exited (even before close), and starts a new one', async () => {
    const { runner, procs, spawn } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    procs[0].emit('exit', 1);
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('ends a running turn shortly after its process exited, if close never comes (a child holds the output)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, events } = setup(undefined, 60000);
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].emit('exit', 1);
    jest.advanceTimersByTime(2000);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'The CLI stopped without an answer' }]]);
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: true });
  });

  it('reports only what the CLI printed to stderr during the failed turn', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].stderr.write('a harmless warning\n');
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    await tick();
    procs[0].exit(1);
    expect(events[events.length - 1]).toEqual(['conv-1', { type: 'error', message: 'The CLI stopped without an answer', sessionId: 's1' }]);
  });

  it('explains a Codex stop without an answer with its last error notice', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    procs[0].line({ method: 'error', params: { error: { message: '401 Unauthorized' }, willRetry: false } });
    await tick();
    procs[0].exit(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: '401 Unauthorized' }]]);
  });

  it('stopAll also forgets the conversations (a reloaded page cannot use them again)', () => {
    const { runner } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    runner.stopAll();
    expect(runner.send('conv-1', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false, message: 'Unknown conversation' });
  });

  it('a new conversation can continue a CLI conversation from before an app restart (resume id)', async () => {
    const { runner, procs, spawn } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a', resume: 's-old' });
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', 's-old', '', '']);
    runner.warm(null, { tool: 'codex', resume: 'T-old' });
    await tick();
    expect(sent(procs[1])[2]).toMatchObject({ method: 'thread/resume', params: { threadId: 'T-old' } });
  });

  it('rejects a resume id that is not a plain id (it goes on a command line)', () => {
    const { runner, spawn } = setup();
    expect(runner.send(null, { tool: 'claude', prompt: 'a', resume: 'x" & del' })).toMatchObject({ ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('forgets a conversation id the CLI no longer has, so the next turn starts a new conversation', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a', resume: 'S-gone' });
    procs[0].line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S-gone',
      errors: ['No conversation found with session ID: S-gone'] });
    await tick();
    procs[0].exit(1);
    expect(events[0]).toEqual(['conv-1', { type: 'notice', message: expect.stringMatching(/new conversation/i), sessionLost: true }]);
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', '-', '', '']);
  });

  it('warm on a live idle process starts its idle time again', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, kill } = setup();
    runner.warm(null, { tool: 'claude' });
    jest.advanceTimersByTime(59000);
    runner.warm('conv-1', { tool: 'claude' });
    jest.advanceTimersByTime(59000);
    expect(kill).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('Stop on a Codex prompt still waiting behind a stopped turn drops it (it never reaches Codex)', async () => {
    const { runner, procs } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    await tick();
    runner.cancel('conv-1');
    runner.send('conv-1', { tool: 'codex', prompt: 'b' });
    runner.cancel('conv-1');
    procs[0].line({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'interrupted' } } });
    await tick();
    expect(sent(procs[0]).filter(m => m.method === 'turn/start')).toHaveLength(1);
  });

  it('Stop during a Codex Freeter tool call ends the process (its confirm box closes with it)', async () => {
    const { runner, procs, kill } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    procs[0].line({ method: 'item/started', params: { threadId: 'T1', turnId: 'U1', item: { type: 'mcpToolCall', tool: 'widget_delete' } } });
    await tick();
    runner.cancel('conv-1');
    expect(kill).toHaveBeenCalledWith(procs[0]);
  });

  it('tells the page about a lost conversation found while warming (no turn yet)', async () => {
    const { runner, procs, events } = setup();
    runner.warm(null, { tool: 'codex', resume: 'T-gone' });
    procs[0].line({ id: 2, error: { code: -32600, message: 'no rollout found for thread id T-gone' } });
    await tick();
    expect(events).toEqual([['conv-1', { type: 'notice', message: expect.stringMatching(/your next message starts a new one/i), sessionLost: true }]]);
  });

  it('passes on the done (with the session id) that comes right after an error in the same line', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'result', subtype: 'error_max_turns', is_error: true, num_turns: 3, session_id: 's1', result: 'Max turns' });
    await tick();
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Max turns', sessionId: 's1' }], ['conv-1', { type: 'done', sessionId: 's1', costUsd: undefined }]]);
  });

  it('ends a process whose stopped turn does not end in time, so the next prompt is not held forever', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill, spawn } = setup(undefined, 600000);
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    await tick();
    runner.cancel('conv-1');
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    jest.advanceTimersByTime(10000);
    expect(kill).toHaveBeenCalledWith(procs[0]);
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'c' });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('the time limit of an earlier Stop does not end a later Stop early', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs, kill } = setup(undefined, 600000);
    const started = () => procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    runner.send(null, { tool: 'claude', prompt: 'a' });
    started();
    await tick();
    runner.cancel('conv-1');
    jest.advanceTimersByTime(1000);
    procs[0].line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 1, session_id: 's' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'b' });
    started();
    await tick();
    jest.advanceTimersByTime(7000);
    runner.cancel('conv-1');
    jest.advanceTimersByTime(2500);
    expect(kill).not.toHaveBeenCalled();
    jest.advanceTimersByTime(8000);
    expect(kill).toHaveBeenCalledWith(procs[0]);
  });

  it('does not look for the CLI on PATH again when the live process is used again', () => {
    const findProgram = jest.fn((t: AgentTool) => (t === 'claude' ? 'C:/claude.exe' : undefined));
    const runner = createAiAgentRunner({
      findProgram, spawn: () => new FakeProcess(), kill: jest.fn(), emit: jest.fn(), argsFor: () => [], newId: () => 'c', timeoutMs: 1000, idleMs: 60000,
    });
    runner.warm(null, { tool: 'claude' });
    runner.warm('c', { tool: 'claude' });
    runner.warm('c', { tool: 'claude' });
    expect(findProgram).toHaveBeenCalledTimes(1);
  });

  it('a Stop passes on the conversation id, so the page can save it', async () => {
    const { runner, procs, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'stream_event', event: { type: 'message_start' } });
    await tick();
    runner.cancel('conv-1');
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Cancelled', sessionId: 's1' }]]);
  });

  it('when the conversation to continue is gone during a turn, starts a new one and sends the same prompt again', async () => {
    const { runner, procs, spawn, events } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a', resume: 'S-gone' });
    procs[0].line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S-gone',
      errors: ['No conversation found with session ID: S-gone'] });
    await tick();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', '-', '', '']);
    expect(sent(procs[1]).map(m => m.message.content)).toEqual(['a']);
    expect(events).toEqual([['conv-1', { type: 'notice', message: expect.stringMatching(/new conversation/i), sessionLost: true }]]);
    procs[1].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's-new' });
    await tick();
    expect(events[1]).toEqual(['conv-1', { type: 'done', sessionId: 's-new', costUsd: undefined }]);
  });

  it('keeps what the CLI said while it was warming, to explain a stop without an answer', async () => {
    const { runner, procs, events } = setup();
    runner.warm(null, { tool: 'claude' });
    procs[0].stderr.write('Please run /login\n');
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'a' });
    procs[0].exit(1);
    expect(events).toEqual([['conv-1', { type: 'error', message: 'Please run /login' }]]);
  });

  it('a session id printed while no turn runs, or by a process stopped on purpose, is not kept', async () => {
    const { runner, procs, spawn } = setup();
    runner.warm(null, { tool: 'claude' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 'early' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'a', effort: 'high' });
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', '-', '', 'high']);
    procs[0].line({ type: 'system', subtype: 'init', session_id: 'from-a-stopped-process' });
    await tick();
    procs[1].line({ type: 'result', subtype: 'success', is_error: false, session_id: 'real' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'b', effort: 'low' });
    expect(spawn).toHaveBeenLastCalledWith('C:/claude.exe', ['claude', 'real', '', 'low']);
  });

  it('keeps a found CLI for a minute (each lookup reads disk on the main thread), and looks for a missing one again', () => {
    jest.useFakeTimers();
    let codex: string | undefined = undefined;
    const findProgram = jest.fn((t: AgentTool) => (t === 'claude' ? 'C:/claude.exe' : codex));
    const runner = createAiAgentRunner({
      findProgram, spawn: () => new FakeProcess(), kill: jest.fn(), emit: jest.fn(), argsFor: () => [], newId: () => 'c', timeoutMs: 1000, idleMs: 60000,
    });
    expect(runner.detect()).toEqual({ claude: true, codex: false });
    expect(runner.detect()).toEqual({ claude: true, codex: false });
    expect(findProgram).toHaveBeenCalledTimes(2); // a missing one is kept a few seconds too (a slow PATH drive)
    codex = 'C:/codex.cmd'; // the user installs it
    jest.advanceTimersByTime(6000);
    expect(runner.detect()).toEqual({ claude: true, codex: true });
    runner.detect();
    expect(findProgram).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(61000);
    runner.detect();
    expect(findProgram).toHaveBeenCalledTimes(5);
  });

  it('looks for a CLI again after its found path could not be started (uninstalled or moved)', async () => {
    const findProgram = jest.fn((_t: AgentTool): string | undefined => 'C:/claude.exe');
    const procs: FakeProcess[] = [];
    const runner = createAiAgentRunner({
      findProgram, spawn: () => { const p = new FakeProcess(); procs.push(p); return p; }, kill: jest.fn(), emit: jest.fn(), argsFor: () => [],
      newId: () => 'c', timeoutMs: 1000, idleMs: 60000,
    });
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].emit('error', new Error('spawn C:/claude.exe ENOENT'));
    await tick();
    runner.detect();
    expect(findProgram.mock.calls.filter(([t]) => t === 'claude')).toHaveLength(2);
  });

  it('does not kill a process that has already exited (Windows could reuse its id)', async () => {
    const { runner, procs, kill } = setup();
    runner.send(null, { tool: 'codex', prompt: 'a' });
    procs[0].emit('exit', 1);
    procs[0].line({ id: 2, error: { code: 1, message: 'boom' } });
    await tick();
    expect(kill).not.toHaveBeenCalled();
  });

  it('a live process keeps the options it was started with, not the prompt', async () => {
    const { runner, procs, spawn } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a'.repeat(1000), model: 'haiku' });
    procs[0].line({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' });
    await tick();
    runner.send('conv-1', { tool: 'claude', prompt: 'b', model: 'haiku' });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('a CLI that cannot be started reports an error and leaves no conversation behind', () => {
    const runner = createAiAgentRunner({
      findProgram: () => 'C:/claude.exe', spawn: () => { throw new Error('spawn EINVAL'); }, kill: jest.fn(), emit: jest.fn(), argsFor: () => [],
      newId: () => 'c', timeoutMs: 1000, idleMs: 60000,
    });
    expect(runner.send(null, { tool: 'claude', prompt: 'a' })).toEqual({ ok: false, message: 'spawn EINVAL' });
    expect(runner.send('c', { tool: 'claude', prompt: 'a' })).toMatchObject({ ok: false, message: 'Unknown conversation' });
  });

  it('a new conversation that cannot be started after a lost one ends the turn with the reason', async () => {
    let n = 0;
    const procs: FakeProcess[] = [];
    const events: [string, AgentEvent][] = [];
    const runner = createAiAgentRunner({
      findProgram: () => 'C:/claude.exe',
      spawn: () => {
        if (++n > 1) {
          throw new Error('spawn EINVAL');
        }
        const p = new FakeProcess();
        procs.push(p);
        return p;
      },
      kill: jest.fn(), emit: (id, e) => events.push([id, e]), argsFor: () => [], newId: () => 'c', timeoutMs: 1000, idleMs: 60000,
    });
    runner.send(null, { tool: 'claude', prompt: 'a', resume: 'S-gone' });
    procs[0].line({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S-gone',
      errors: ['No conversation found with session ID: S-gone'] });
    await tick();
    expect(events[events.length - 1]).toEqual(['c', { type: 'error', message: 'spawn EINVAL' }]);
    expect(runner.send('c', { tool: 'claude', prompt: 'b' })).toMatchObject({ ok: false, message: 'spawn EINVAL' });
  });

  it('tells the page a new conversation id during the turn (the page can save it before the turn ends)', async () => {
    const { runner, procs, events } = setup(undefined, 1000, true);
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 's1' });
    await tick();
    expect(events).toEqual([['conv-1', { type: 'session', sessionId: 's1' }]]);
  });

  it('leaves no timer behind once every process ended (a Stop in progress included)', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const { runner, procs } = setup(undefined, 600000);
    runner.send(null, { tool: 'codex', prompt: 'a' });
    codexThread(procs[0]);
    await tick();
    codexTurn(procs[0], 'U1');
    await tick();
    runner.cancel('conv-1'); // interrupt sent; a grace timer waits for the turn to end
    runner.stopAll();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('keeps a conversation id from the CLI only when it is a safe id (it goes on a command line later)', async () => {
    const { runner, procs, events } = setup(undefined, 1000, true);
    runner.send(null, { tool: 'claude', prompt: 'a' });
    procs[0].line({ type: 'system', subtype: 'init', session_id: 'x & del' });
    await tick();
    expect(events).toEqual([]);
  });

  it('stopAll kills every running turn', () => {
    const { runner, kill } = setup();
    runner.send(null, { tool: 'claude', prompt: 'a' });
    runner.send(null, { tool: 'codex', prompt: 'b' });
    runner.stopAll();
    expect(kill).toHaveBeenCalledTimes(2);
  });
});
