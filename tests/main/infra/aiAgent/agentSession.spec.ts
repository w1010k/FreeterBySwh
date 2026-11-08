/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createAgentSession } from '@/infra/aiAgent/agentSession';

const j = (o: object) => JSON.stringify(o);
const lines = (s: string) => s.trim().split('\n').map(l => JSON.parse(l));

describe('createAgentSession(claude)', () => {
  it('writes nothing at start and sends each prompt as a stream-json line', () => {
    const s = createAgentSession('claude');
    expect(s.start()).toBe('');
    expect(lines(s.prompt('hi') as string)).toEqual([{ type: 'user', message: { role: 'user', content: 'hi' } }]);
  });

  it('reads events and the session id from its output', () => {
    const s = createAgentSession('claude');
    expect(s.read(j({ type: 'result', subtype: 'success', is_error: false, session_id: 's1' })))
      .toEqual({ events: [{ type: 'done', sessionId: 's1', costUsd: undefined }], sessionId: 's1' });
  });
});

describe('createAgentSession(codex)', () => {
  function started(sessionId?: string) {
    const s = createAgentSession('codex', sessionId);
    const start = lines(s.start());
    const threadReq = start[2];
    s.read(j({ id: threadReq.id, result: { thread: { id: 'T1' } } }));
    const turnReq = lines(s.prompt('hi') as string)[0];
    s.read(j({ id: turnReq.id, result: { turn: { id: 'U1', status: 'inProgress' } } }));
    return { s, start, turnReq };
  }

  it('starts with initialize, initialized and a read-only thread that never asks for approval', () => {
    const s = createAgentSession('codex');
    const [init, initialized, thread] = lines(s.start());
    expect(init).toMatchObject({ method: 'initialize', params: { clientInfo: { name: 'freeter' } } });
    expect(initialized).toEqual({ jsonrpc: '2.0', method: 'initialized' });
    expect(thread).toMatchObject({ method: 'thread/start', params: { sandbox: 'read-only', approvalPolicy: 'never' } });
    expect(thread.params.developerInstructions).toMatch(/freeter.*tools/i);
  });

  it('resumes the thread of an earlier conversation', () => {
    const [, , thread] = lines(createAgentSession('codex', 'T0').start());
    expect(thread).toMatchObject({ method: 'thread/resume', params: { threadId: 'T0', sandbox: 'read-only', approvalPolicy: 'never' } });
  });

  it('holds a prompt until the thread started, then sends turns on it', () => {
    const s = createAgentSession('codex');
    const thread = lines(s.start())[2];
    expect(s.prompt('hi')).toBeUndefined();
    expect(s.read(j({ id: thread.id, result: { thread: { id: 'T1' } } }))).toEqual({ events: [], ready: true });
    expect(lines(s.prompt('hi') as string)[0]).toMatchObject({ method: 'turn/start', params: { threadId: 'T1', input: [{ type: 'text', text: 'hi', text_elements: [] }] } });
  });

  it('ends the process when the thread cannot start', () => {
    const s = createAgentSession('codex');
    const thread = lines(s.start())[2];
    expect(s.read(j({ id: thread.id, error: { code: 1, message: 'no such thread' } })))
      .toEqual({ events: [{ type: 'error', message: 'Codex could not open the conversation: no such thread' }], end: true });
  });

  it('maps the turn: paragraph start, text deltas, tool calls and completion', () => {
    const { s } = started();
    const n = (method: string, params: object) => s.read(j({ method, params: { threadId: 'T1', turnId: 'U1', ...params } })).events;
    expect(n('item/started', { item: { type: 'agentMessage', id: 'i1' } })).toEqual([{ type: 'text', text: '' }]);
    expect(n('item/agentMessage/delta', { itemId: 'i1', delta: 'Hel' })).toEqual([{ type: 'textDelta', text: 'Hel' }]);
    expect(n('item/started', { item: { type: 'mcpToolCall', tool: 'app_describe', status: 'inProgress' } }))
      .toEqual([{ type: 'tool', name: 'app_describe', phase: 'start' }]);
    expect(n('item/completed', { item: { type: 'mcpToolCall', tool: 'app_describe', status: 'failed' } }))
      .toEqual([{ type: 'tool', name: 'app_describe', phase: 'end', ok: false }]);
    expect(n('item/started', { item: { type: 'commandExecution', status: 'inProgress' } })).toEqual([{ type: 'tool', name: 'shell', phase: 'start' }]);
    expect(n('item/completed', { item: { type: 'userMessage' } })).toEqual([]);
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'completed' } } })).events)
      .toEqual([{ type: 'done', sessionId: 'T1' }]);
  });

  it('reports a failed turn with its message, and keeps an error notice as a note', () => {
    const { s } = started();
    expect(s.read(j({ method: 'error', params: { error: { message: 'Reconnecting 1/5' }, willRetry: true, threadId: 'T1', turnId: 'U1' } })))
      .toEqual({ events: [], note: 'Reconnecting 1/5' });
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed', error: { message: 'quota' } } } })).events)
      .toEqual([{ type: 'error', message: 'quota' }]);
  });

  it('ends the turn on an error Codex does not retry, and drops that turn\'s later completion', () => {
    const { s } = started();
    expect(s.read(j({ method: 'error', params: { error: { message: 'stream disconnected' }, willRetry: false, threadId: 'T1', turnId: 'U1' } })).events)
      .toEqual([{ type: 'error', message: 'stream disconnected' }]);
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed', error: { message: 'x' } } } })).events)
      .toEqual([]);
  });

  it('holds the next prompt until the failed turn ends inside Codex (Codex would merge it into that turn)', () => {
    const { s } = started();
    s.read(j({ method: 'error', params: { error: { message: 'stream disconnected' }, willRetry: false, threadId: 'T1', turnId: 'U1' } }));
    expect(s.stopping()).toBe(true);
    expect(s.prompt('again')).toBeUndefined();
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed' } } })))
      .toEqual({ events: [], sessionId: 'T1', ready: true });
    expect(s.prompt('again')).toBeDefined();
  });

  it('keeps a final error that comes after its turn completed as a note (nothing is left to wait for)', () => {
    const { s } = started();
    s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed', error: { message: 'x' } } } }));
    expect(s.read(j({ method: 'error', params: { error: { message: 'late' }, willRetry: false, threadId: 'T1', turnId: 'U1' } })))
      .toEqual({ events: [], note: 'late' });
    expect(s.stopping()).toBe(false);
  });

  it('keeps a final error without a turn id as a note (the turn ends on its completion)', () => {
    const { s } = started();
    expect(s.read(j({ method: 'error', params: { error: { message: 'boom' }, willRetry: false, threadId: 'T1' } })))
      .toEqual({ events: [], note: 'boom' });
  });

  it('interrupts the running turn inside the CLI and drops what that turn sends later', () => {
    const { s } = started();
    expect(lines(s.interrupt() as string)[0]).toMatchObject({ method: 'turn/interrupt', params: { threadId: 'T1', turnId: 'U1' } });
    expect(s.read(j({ method: 'item/agentMessage/delta', params: { threadId: 'T1', turnId: 'U1', itemId: 'i', delta: 'late' } })).events).toEqual([]);
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'interrupted' } } })).events).toEqual([]);
  });

  it('cannot interrupt before the turn has an id (the process must end instead)', () => {
    const s = createAgentSession('codex');
    const thread = lines(s.start())[2];
    s.read(j({ id: thread.id, result: { thread: { id: 'T1' } } }));
    s.prompt('hi');
    expect(s.interrupt()).toBeUndefined();
  });

  it('reports a turn that could not start', () => {
    const s = createAgentSession('codex');
    const thread = lines(s.start())[2];
    s.read(j({ id: thread.id, result: { thread: { id: 'T1' } } }));
    const turnReq = lines(s.prompt('hi') as string)[0];
    expect(s.read(j({ id: turnReq.id, error: { code: 1, message: 'bad input' } })).events).toEqual([{ type: 'error', message: 'bad input' }]);
  });

  it('declines requests from the CLI (approvals, questions) so a turn never waits on them', () => {
    const { s } = started();
    const res = s.read(j({ id: 77, method: 'item/commandExecution/requestApproval', params: {} }));
    expect(res.events).toEqual([]);
    expect(lines(res.reply as string)[0]).toMatchObject({ jsonrpc: '2.0', id: 77, error: { code: -32601 } });
  });

  it('ignores lines that are not JSON', () => {
    expect(createAgentSession('codex').read('WARN something')).toEqual({ events: [] });
  });
});

describe('createAgentSession: review fixes', () => {
  function startedCodex(resume?: string) {
    const s = createAgentSession('codex', resume);
    const thread = lines(s.start())[2];
    s.read(j({ id: thread.id, result: { thread: { id: 'T1' } } }));
    const turnReq = lines(s.prompt('hi') as string)[0];
    s.read(j({ id: turnReq.id, result: { turn: { id: 'U1' } } }));
    return s;
  }

  it('ends a Codex turn that Codex itself stopped (interrupted without a Stop from Freeter)', () => {
    const s = startedCodex();
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'interrupted' } } })).events)
      .toEqual([{ type: 'error', message: 'Codex stopped the answer' }]);
  });

  it('shows a Codex answer that came without text deltas from its completed item', () => {
    const s = startedCodex();
    const n = (method: string, params: object) => s.read(j({ method, params: { threadId: 'T1', turnId: 'U1', ...params } })).events;
    expect(n('item/started', { item: { type: 'agentMessage', id: 'a' } })).toEqual([{ type: 'text', text: '' }]);
    expect(n('item/completed', { item: { type: 'agentMessage', id: 'a', text: 'Whole answer' } })).toEqual([{ type: 'textDelta', text: 'Whole answer' }]);
    n('item/started', { item: { type: 'agentMessage', id: 'b' } });
    n('item/agentMessage/delta', { itemId: 'b', delta: 'Str' });
    expect(n('item/completed', { item: { type: 'agentMessage', id: 'b', text: 'Str' } })).toEqual([]);
  });

  it('after a Stop, holds the next Codex prompt until the stopped turn has ended', () => {
    const s = startedCodex();
    s.interrupt();
    expect(s.prompt('next')).toBeUndefined();
    expect(s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'interrupted' } } })))
      .toEqual({ events: [], sessionId: 'T1', ready: true });
    expect(lines(s.prompt('next') as string)[0]).toMatchObject({ method: 'turn/start' });
  });

  it('reports a Codex thread that could not be resumed as a lost conversation', () => {
    const s = createAgentSession('codex', 'T-gone');
    const thread = lines(s.start())[2];
    expect(s.read(j({ id: thread.id, error: { code: -32600, message: 'no rollout found for thread id T-gone' } })))
      .toEqual({ events: [], sessionLost: true, end: true });
  });

  it('reports a Claude session that could not be resumed as a lost conversation', () => {
    const s = createAgentSession('claude', 'S-gone');
    const res = s.read(j({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S-gone',
      errors: ['No conversation found with session ID: S-gone'] }));
    expect(res).toEqual({ events: [], sessionLost: true, end: true });
  });

  it('reports a later failed Claude turn with its own message, not as a lost conversation', () => {
    const s = createAgentSession('claude', 'S');
    s.read(j({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, session_id: 'S' }));
    const res = s.read(j({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S', result: 'Overloaded' }));
    expect(res.events[0]).toEqual({ type: 'error', message: 'Overloaded' });
  });

  it('a Codex Stop during a tool call cannot be done inside the CLI (the process must end)', () => {
    const s = startedCodex();
    s.read(j({ method: 'item/started', params: { threadId: 'T1', turnId: 'U1', item: { type: 'mcpToolCall', tool: 'x' } } }));
    expect(s.interrupt()).toBeUndefined();
    s.read(j({ method: 'item/completed', params: { threadId: 'T1', turnId: 'U1', item: { type: 'mcpToolCall', tool: 'x', status: 'completed' } } }));
    expect(s.interrupt()).toBeDefined();
  });

  it('a resumed Claude process that fails at once for another reason (overloaded) keeps the conversation', () => {
    const s = createAgentSession('claude', 'S');
    const res = s.read(j({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 0, session_id: 'S', errors: ['Overloaded'] }));
    expect(res.events[0]).toEqual({ type: 'error', message: 'Overloaded' });
    expect(res.end).toBeUndefined();
  });

  it('a Codex resume that fails for another reason shows that reason and keeps the conversation', () => {
    const s = createAgentSession('codex', 'T1');
    const thread = lines(s.start())[2];
    expect(s.read(j({ id: thread.id, error: { code: -32603, message: 'auth refresh failed' } })))
      .toEqual({ events: [{ type: 'error', message: 'Codex could not open the conversation: auth refresh failed' }], end: true });
  });

  it('a Codex turn that ends with a tool call still open does not block later Stops', () => {
    const s = startedCodex();
    s.read(j({ method: 'item/started', params: { threadId: 'T1', turnId: 'U1', item: { type: 'mcpToolCall', tool: 'x' } } }));
    s.read(j({ method: 'turn/completed', params: { threadId: 'T1', turn: { id: 'U1', status: 'failed', error: { message: 'x' } } } }));
    const turnReq = lines(s.prompt('next') as string)[0];
    s.read(j({ id: turnReq.id, result: { turn: { id: 'U2' } } }));
    expect(s.interrupt()).toBeDefined();
  });

  it('gives the id of a new Codex thread once a turn started in it (Codex saves no thread before that)', () => {
    const s = createAgentSession('codex');
    const thread = lines(s.start())[2];
    expect(s.read(j({ id: thread.id, result: { thread: { id: 'T1' } } })).sessionId).toBeUndefined();
    const turnReq = lines(s.prompt('hi') as string)[0];
    expect(s.read(j({ id: turnReq.id, result: { turn: { id: 'U1' } } })).sessionId).toBe('T1');
  });

  it('stops a Claude turn inside the process, drops the rest of it, and holds the next prompt until it ended', () => {
    const s = createAgentSession('claude');
    s.prompt('hi');
    s.read(j({ type: 'stream_event', event: { type: 'message_start' } }));
    const stop = JSON.parse(s.interrupt() as string);
    expect(stop).toMatchObject({ type: 'control_request', request: { subtype: 'interrupt' } });
    expect(s.prompt('next')).toBeUndefined();
    expect(s.read(j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'late' } } })).events).toEqual([]);
    expect(s.read(j({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 1, session_id: 'S' })))
      .toEqual({ events: [], sessionId: 'S', ready: true });
    expect(JSON.parse(s.prompt('next') as string)).toMatchObject({ type: 'user' });
  });

  it('a Claude Stop during a Freeter tool call cannot be done inside the process (its confirm box must close)', () => {
    const s = createAgentSession('claude');
    s.prompt('hi');
    s.read(j({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__freeter__widget_delete' }] } }));
    expect(s.interrupt()).toBeUndefined();
    s.read(j({ type: 'user', message: { content: [{ type: 'tool_result', is_error: false }] } }));
    expect(s.interrupt()).toBeDefined();
  });

  it('tells whether a Stop is still ending (the runner gives up on it after a while)', () => {
    const s = createAgentSession('claude');
    s.prompt('hi');
    s.read(j({ type: 'stream_event', event: { type: 'message_start' } }));
    expect(s.stopping()).toBe(false);
    s.interrupt();
    expect(s.stopping()).toBe(true);
    s.read(j({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 1, session_id: 'S' }));
    expect(s.stopping()).toBe(false);
  });

  it('a Claude Stop before the turn produced any output cannot be done inside the process (nothing to interrupt yet)', () => {
    const s = createAgentSession('claude');
    s.prompt('hi');
    expect(s.interrupt()).toBeUndefined();
    s.read(j({ type: 'stream_event', event: { type: 'message_start' } }));
    expect(s.interrupt()).toBeDefined();
  });

  it('shows a Claude answer that came without stream deltas from its complete message', () => {
    const s = createAgentSession('claude');
    expect(s.read(j({ type: 'assistant', message: { content: [{ type: 'text', text: 'Whole' }] } })).events).toEqual([{ type: 'text', text: 'Whole' }]);
    s.read(j({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Str' } } }));
    expect(s.read(j({ type: 'assistant', message: { content: [{ type: 'text', text: 'Str' }] } })).events).toEqual([]);
  });
});
