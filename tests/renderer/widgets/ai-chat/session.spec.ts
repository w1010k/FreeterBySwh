/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEvent, AgentSendRequest } from '@common/ai/agent';
import { AiAgentProvider } from '@/application/interfaces/aiAgentProvider';
import { createChatSession, SavedChat } from '@/widgets/ai-chat/session';

type SavedChatT = SavedChat | undefined;

function setupApi() {
  const listeners = new Map<string, (e: AgentEvent) => void>();
  let next = 1;
  const api: jest.Mocked<AiAgentProvider> = {
    detect: jest.fn(async () => ({ claude: true, codex: true })),
    send: jest.fn(async (id: string | null, _req: AgentSendRequest) => ({ ok: true as const, conversationId: id ?? `c${next++}` })),
    cancel: jest.fn(),
    warm: jest.fn(async (id: string | null, _o: Omit<AgentSendRequest, 'prompt'>) => ({ ok: true as const, conversationId: id ?? `c${next++}` })),
    end: jest.fn(),
    onEvent: jest.fn((id: string, fn: (e: AgentEvent) => void) => {
      listeners.set(id, fn);
      return () => listeners.delete(id);
    }),
  };
  const emit = (id: string, e: AgentEvent) => listeners.get(id)?.(e);
  return { api, emit, listeners };
}

const claude = { tool: 'claude' as const, model: '', effort: '' as const };

describe('ChatSession', () => {
  it('sends a prompt, shows the answer and tool calls, and ends the turn on done', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    await s.send('add a note', claude);
    expect(api.send).toHaveBeenCalledWith(null, { tool: 'claude', prompt: 'add a note' });
    expect(s.get().running).toBe(true);
    emit('c1', { type: 'tool', name: 'actions_run', phase: 'start' });
    emit('c1', { type: 'tool', name: '', phase: 'end', ok: true });
    emit('c1', { type: 'text', text: 'Done.' });
    emit('c1', { type: 'text', text: 'Anything else?' });
    emit('c1', { type: 'done' });
    expect(s.get()).toEqual({ running: false, first: 0, items: [
        { kind: 'user', text: 'add a note' },
        { kind: 'tool', name: 'actions_run', state: 'ok' },
        { kind: 'assistant', text: 'Done.\n\nAnything else?' },
      ]
    });
  });

  it('continues the same conversation and passes model and effort', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    await s.send('one', claude);
    emit('c1', { type: 'done' });
    await s.send('two', { tool: 'claude', model: 'haiku', effort: 'low' });
    expect(api.send).toHaveBeenLastCalledWith('c1', { tool: 'claude', prompt: 'two', model: 'haiku', effort: 'low' });
    expect(api.onEvent).toHaveBeenCalledTimes(1);
  });

  it('starts a new conversation when the tool changes', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    await s.send('one', claude);
    emit('c1', { type: 'done' });
    await s.send('two', { ...claude, tool: 'codex' });
    expect(api.send).toHaveBeenLastCalledWith(null, { tool: 'codex', prompt: 'two' });
    expect(s.get().items.map(i => i.kind)).toEqual(['user', 'note', 'user']);
  });

  it('ignores an empty prompt and a prompt while a turn runs', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await s.send('   ', claude);
    await s.send('one', claude);
    await s.send('two', claude);
    expect(api.send).toHaveBeenCalledTimes(1);
  });

  it('shows a refused send and an error event, and ends the turn', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    api.send.mockResolvedValueOnce({ ok: false, message: 'claude is not installed' });
    await s.send('one', claude);
    expect(s.get()).toEqual({ running: false, first: 0, items: [{ kind: 'user', text: 'one' }, { kind: 'error', text: 'claude is not installed' }] });
    await s.send('two', claude);
    emit('c1', { type: 'tool', name: 'actions_run', phase: 'start' });
    emit('c1', { type: 'error', message: 'Cancelled' });
    expect(s.get().running).toBe(false);
    expect(s.get().items.slice(-2)).toEqual([{ kind: 'tool', name: 'actions_run', state: 'failed' }, { kind: 'error', text: 'Cancelled' }]);
  });

  it('cancels the running turn', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    s.cancel();
    expect(api.cancel).not.toHaveBeenCalled();
    await s.send('one', claude);
    s.cancel();
    expect(api.cancel).toHaveBeenCalledWith('c1');
  });

  it('reset ends the conversation, stops listening and clears the messages', async () => {
    const { api, listeners } = setupApi();
    const s = createChatSession(api);
    await s.send('one', claude);
    s.reset();
    expect(api.end).toHaveBeenCalledWith('c1');
    expect(listeners.size).toBe(0);
    expect(s.get()).toEqual({ running: false, first: 0, items: [] });
    await s.send('two', claude);
    expect(api.send).toHaveBeenLastCalledWith(null, { tool: 'claude', prompt: 'two' });
  });

  it('reset works when passed on as a plain function (an action bar item)', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await s.send('one', claude);
    const { reset } = s;
    reset();
    expect(api.end).toHaveBeenCalledWith('c1');
  });

  it('a send right after New Conversation does not wait for the warm-up that came before it', async () => {
    const { api } = setupApi();
    api.warm.mockImplementationOnce(() => new Promise(() => undefined)); // a CLI that takes long to start
    const s = createChatSession(api);
    void s.warm(claude);
    while (api.warm.mock.calls.length === 0) {
      await Promise.resolve();
    }
    s.reset();
    await s.send('hi', claude);
    expect(api.send).toHaveBeenCalledWith(null, { tool: 'claude', prompt: 'hi' });
  });

  it('reset before the first send went out drops it', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    const sending = s.send('one', claude);
    s.reset();
    await sending;
    expect(api.send).not.toHaveBeenCalled();
    expect(s.get()).toEqual({ running: false, first: 0, items: [] });
  });

  it('reset while main answers the first send ends that conversation', async () => {
    const { api, listeners } = setupApi();
    let answer: (v: { ok: true; conversationId: string }) => void = () => undefined;
    api.send.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    const s = createChatSession(api);
    const sending = s.send('one', claude);
    await new Promise(r => setTimeout(r, 0));
    expect(api.send).toHaveBeenCalled();
    s.reset();
    answer({ ok: true, conversationId: 'c1' });
    await sending;
    expect(api.end).toHaveBeenCalledWith('c1');
    expect(listeners.size).toBe(0);
    expect(s.get()).toEqual({ running: false, first: 0, items: [] });
  });

  it('grows the answer from streamed text: a text event opens a paragraph, deltas extend it', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    await s.send('hi', claude);
    emit('c1', { type: 'text', text: '' });
    emit('c1', { type: 'textDelta', text: 'Hel' });
    emit('c1', { type: 'textDelta', text: 'lo' });
    emit('c1', { type: 'text', text: '' });
    emit('c1', { type: 'textDelta', text: 'Bye' });
    expect(s.get().items[1]).toEqual({ kind: 'assistant', text: 'Hello\n\nBye' });
    emit('c1', { type: 'tool', name: 't', phase: 'start' });
    emit('c1', { type: 'textDelta', text: 'After' });
    expect(s.get().items.slice(2)).toEqual([{ kind: 'tool', name: 't', state: 'running' }, { kind: 'assistant', text: 'After' }]);
  });

  it('warm starts a conversation early and listens to it; the first send goes to it', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await s.warm(claude);
    await s.warm(claude);
    expect(api.warm).toHaveBeenCalledTimes(2);
    expect(api.warm).toHaveBeenNthCalledWith(1, null, { tool: 'claude' });
    expect(api.warm).toHaveBeenNthCalledWith(2, 'c1', { tool: 'claude' });
    expect(api.onEvent).toHaveBeenCalledTimes(1);
    await s.send('one', claude);
    expect(api.send).toHaveBeenCalledWith('c1', { tool: 'claude', prompt: 'one' });
  });

  it('a send while warm waits for its id goes to the same conversation', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    const warming = s.warm(claude);
    await s.send('one', claude);
    await warming;
    expect(api.send).toHaveBeenCalledWith('c1', { tool: 'claude', prompt: 'one' });
  });

  it('warm does nothing while a turn runs or for another tool than the conversation', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await s.send('one', claude);
    await s.warm(claude);
    await s.warm({ ...claude, tool: 'codex' });
    expect(api.warm).not.toHaveBeenCalled();
  });

  it('restores a saved conversation and continues the CLI conversation (after an app restart)', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, sessionId: 's-old', items: [{ kind: 'user' as const, text: 'earlier' }] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.warm(claude);
    expect(s.get().items).toEqual([{ kind: 'user', text: 'earlier' }]);
    expect(api.warm).toHaveBeenCalledWith(null, { tool: 'claude', resume: 's-old' });
  });

  it('does not resume a saved conversation of another tool', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'codex' as const, sessionId: 'T-old', items: [] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(api.send).toHaveBeenCalledWith(null, { tool: 'claude', prompt: 'hi' });
  });

  it('saves the conversation when a turn ends, with the id to resume it; reset clears the save', async () => {
    const { api, emit } = setupApi();
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    const afterSend = store.save.mock.calls.length;
    emit('c1', { type: 'textDelta', text: 'Hello' });
    expect(store.save).toHaveBeenCalledTimes(afterSend); // not per streamed token
    emit('c1', { type: 'done', sessionId: 's1' });
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', sessionId: 's1', items: [{ kind: 'user', text: 'hi' }, { kind: 'assistant', text: 'Hello' }] });
    s.reset();
    expect(store.save).toHaveBeenLastCalledWith(undefined);
  });

  it('saves at most the last 200 items', async () => {
    const { api, emit } = setupApi();
    const many = Array.from({ length: 250 }, (_, i) => ({ kind: 'user' as const, text: String(i) }));
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, items: many })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    emit('c1', { type: 'done', sessionId: 's1' });
    const saved = store.save.mock.calls.at(-1)?.[0];
    expect(saved.items).toHaveLength(200);
    expect(saved.items.at(-1)).toEqual({ kind: 'user', text: 'hi' });
  });

  it('switching the tool after a send that failed adds no "new conversation" note (there was none)', async () => {
    const { api } = setupApi();
    api.send.mockResolvedValueOnce({ ok: false, message: 'Claude Code is not installed' });
    const s = createChatSession(api);
    await s.send('hi', claude);
    await s.send('again', { ...claude, tool: 'codex' });
    expect(s.get().items.some(i => i.kind === 'note')).toBe(false);
  });

  it('warm does not start another tool on a saved conversation; the send then switches with a note', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, sessionId: 'S', items: [{ kind: 'user' as const, text: 'old' }] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.warm({ ...claude, tool: 'codex' });
    expect(api.warm).not.toHaveBeenCalled();
    await s.send('hi', { ...claude, tool: 'codex' });
    expect(api.send).toHaveBeenCalledWith(null, { tool: 'codex', prompt: 'hi' });
    expect(s.get().items.map(i => i.kind)).toEqual(['user', 'note', 'user']);
  });

  it('after New Conversation, warm may start any tool', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, items: [] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.warm(claude);
    s.reset();
    await s.warm({ ...claude, tool: 'codex' });
    expect(api.warm).toHaveBeenLastCalledWith(null, { tool: 'codex' });
  });

  it('New Conversation before the save finished loading keeps the conversation new', async () => {
    const { api } = setupApi();
    let load: (v: SavedChatT) => void = () => undefined;
    const store = { load: jest.fn(() => new Promise<SavedChatT>(r => { load = r; })), save: jest.fn() };
    const s = createChatSession(api, store);
    s.reset();
    load({ tool: 'claude', sessionId: 'S-old', items: [{ kind: 'user', text: 'old' }] });
    await s.send('hi', claude);
    expect(s.get().items).toEqual([{ kind: 'user', text: 'hi' }]);
    expect(api.send).toHaveBeenCalledWith(null, { tool: 'claude', prompt: 'hi' });
  });

  it('keeps at most the last 500 items in memory', async () => {
    const { api } = setupApi();
    const many = Array.from({ length: 600 }, (_, i) => ({ kind: 'user' as const, text: String(i) }));
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, items: many })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(s.get().items).toHaveLength(500);
    expect(s.get().items[499]).toEqual({ kind: 'user', text: 'hi' });
  });

  it('send tells whether it took the prompt', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await expect(s.send('  ', claude)).resolves.toBe(false);
    await expect(s.send('one', claude)).resolves.toBe(true);
    await expect(s.send('two', claude)).resolves.toBe(false);
  });

  it('counts the items that left the list, so a view can key items by their place in the whole conversation', async () => {
    const { api } = setupApi();
    const many = Array.from({ length: 500 }, (_, i) => ({ kind: 'user' as const, text: String(i) }));
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, items: many })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(s.get().first).toBe(1);
    expect(s.get().items[0]).toEqual({ kind: 'user', text: '1' });
  });

  it('a saved conversation of another tool (without an id to continue) gets the switch note too', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'codex' as const, items: [{ kind: 'user' as const, text: 'old' }] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(s.get().items.map(i => i.kind)).toEqual(['user', 'note', 'user']);
  });

  it('close ends the CLI conversation but keeps the save (a copied widget pasted later gets it)', async () => {
    const { api, listeners } = setupApi();
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    s.close();
    expect(api.end).toHaveBeenCalledWith('c1');
    expect(listeners.size).toBe(0);
    expect(store.save).not.toHaveBeenCalledWith(undefined);
  });

  it('a tool switch after warming an empty chat shows no note (there was no conversation yet)', async () => {
    const { api } = setupApi();
    const s = createChatSession(api);
    await s.warm(claude);
    await s.send('hi', { ...claude, tool: 'codex' });
    expect(api.end).toHaveBeenCalledWith('c1');
    expect(s.get().items).toEqual([{ kind: 'user', text: 'hi' }]);
  });

  it('Stop while the first send waits for main stops that turn once its id comes', async () => {
    const { api } = setupApi();
    let answer: (v: { ok: true; conversationId: string }) => void = () => undefined;
    api.send.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    const s = createChatSession(api);
    const sending = s.send('one', claude);
    await new Promise(r => setTimeout(r, 0));
    s.cancel();
    answer({ ok: true, conversationId: 'c1' });
    await sending;
    expect(api.cancel).toHaveBeenCalledWith('c1');
  });

  it('saves the conversation id an error or Stop reports', async () => {
    const { api, emit } = setupApi();
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    emit('c1', { type: 'error', message: 'Cancelled', sessionId: 's1' });
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 's1' }));
  });

  it('a notice of a lost conversation shows a note, keeps the turn running and forgets the old id', async () => {
    const { api, emit } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, sessionId: 'S-gone', items: [] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    emit('c1', { type: 'notice', message: 'Starting a new conversation', sessionLost: true });
    expect(s.get().running).toBe(true);
    expect(s.get().items.at(-1)).toEqual({ kind: 'note', text: 'Starting a new conversation' });
    emit('c1', { type: 'done' });
    expect(store.save).toHaveBeenLastCalledWith(expect.not.objectContaining({ sessionId: 'S-gone' }));
  });

  it('a notice of a lost conversation saves at once without the lost id', async () => {
    const { api, emit } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, sessionId: 'S-gone', items: [{ kind: 'user' as const, text: 'old' }] })), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.warm(claude);
    emit('c1', { type: 'notice', message: 'A new conversation starts', sessionLost: true });
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', items: [{ kind: 'user', text: 'old' }, { kind: 'note', text: 'A new conversation starts' }] });
  });

  it('a tool switch takes effect at once: a failed send does not repeat the note, and the save has the new tool', async () => {
    const { api } = setupApi();
    const store = { load: jest.fn(async () => ({ tool: 'claude' as const, sessionId: 'S', items: [{ kind: 'user' as const, text: 'old' }] })), save: jest.fn() };
    const s = createChatSession(api, store);
    api.send.mockResolvedValue({ ok: false, message: 'codex is not installed' });
    await s.send('one', { ...claude, tool: 'codex' });
    await s.send('two', { ...claude, tool: 'codex' });
    expect(s.get().items.filter(i => i.kind === 'note')).toHaveLength(1);
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ tool: 'codex' }));
    expect(store.save).not.toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'S' }));
  });

  it('a tool end with a name closes that tool, not the oldest one', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    await s.send('hi', claude);
    emit('c1', { type: 'tool', name: 'A', phase: 'start' });
    emit('c1', { type: 'tool', name: 'B', phase: 'start' });
    emit('c1', { type: 'tool', name: 'B', phase: 'end', ok: false });
    expect(s.get().items.slice(1)).toEqual([{ kind: 'tool', name: 'A', state: 'running' }, { kind: 'tool', name: 'B', state: 'failed' }]);
  });

  it('saves the prompt when it is sent and the conversation id as soon as it is known (an app quit loses neither)', async () => {
    const { api, emit } = setupApi();
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', items: [{ kind: 'user', text: 'hi' }] });
    emit('c1', { type: 'session', sessionId: 's1' });
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', sessionId: 's1', items: [{ kind: 'user', text: 'hi' }] });
  });

  it('saves the error when main refuses the send (the saved prompt does not look unanswered)', async () => {
    const { api } = setupApi();
    api.send.mockResolvedValueOnce({ ok: false, message: 'Claude Code is not installed' });
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.send('hi', claude);
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', items: [{ kind: 'user', text: 'hi' }, { kind: 'error', text: 'Claude Code is not installed' }] });
  });

  it('saves an event that arrives on subscribe (kept by the provider) of a new conversation', async () => {
    const { api } = setupApi();
    api.onEvent.mockImplementationOnce((_id, fn) => {
      fn({ type: 'session', sessionId: 's1' });
      return () => undefined;
    });
    const store = { load: jest.fn(async () => undefined), save: jest.fn() };
    const s = createChatSession(api, store);
    await s.warm(claude);
    expect(store.save).toHaveBeenLastCalledWith({ tool: 'claude', sessionId: 's1', items: [] });
  });

  it('notifies subscribers on every change, until they unsubscribe', async () => {
    const { api, emit } = setupApi();
    const s = createChatSession(api);
    const fn = jest.fn();
    const off = s.subscribe(fn);
    await s.send('one', claude);
    const calls = fn.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    off();
    emit('c1', { type: 'done' });
    expect(fn).toHaveBeenCalledTimes(calls);
  });
});
