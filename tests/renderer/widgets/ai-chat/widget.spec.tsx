/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { AgentEvent, AgentSendRequest } from '@common/ai/agent';
import { forgetChatSession, widgetComp, resetChatSessions } from '@/widgets/ai-chat/widget';
import { createSettingsState, Settings } from '@/widgets/ai-chat/settings';
import { setupWidgetSut } from '@tests/widgets/setupSut';
import { ActionBarItems } from '@/widgets/appModules';
import aiChatType from '@/widgets/ai-chat';

function setupAgent(found = { claude: true, codex: true }) {
  const listeners = new Map<string, (e: AgentEvent) => void>();
  const aiAgent = {
    detect: jest.fn(async () => found),
    send: jest.fn(async (id: string | null, _req: AgentSendRequest) => ({ ok: true as const, conversationId: id ?? 'C1' })),
    cancel: jest.fn(),
    warm: jest.fn(async (id: string | null) => ({ ok: true as const, conversationId: id ?? 'C1' })),
    end: jest.fn(),
    onEvent: jest.fn((id: string, fn: (e: AgentEvent) => void) => {
      listeners.set(id, fn);
      return () => listeners.delete(id);
    }),
  };
  const emit = (e: AgentEvent) => act(() => listeners.get('C1')?.(e));
  return { aiAgent, emit };
}

const settings = (s: Partial<Settings> = {}) => createSettingsState(s);
const input = () => screen.getByRole('textbox', { name: 'Message' });
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });

beforeEach(() => {
  resetChatSessions();
});

describe('AI Chat widget', () => {
  it('sends on Enter with the settings, and shows the answer', async () => {
    const { aiAgent, emit } = setupAgent();
    setupWidgetSut(widgetComp, settings({ tool: 'codex', model: 'gpt-5', effort: 'low' }), { mockWidgetApi: { aiAgent } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'codex', model: 'gpt-5', effort: 'low' });
    expect(aiAgent.send).toHaveBeenCalledWith('C1', { tool: 'codex', prompt: 'hello', model: 'gpt-5', effort: 'low' });
    expect(input()).toHaveValue('');
    expect(screen.getByText('hello')).toBeInTheDocument();
    emit({ type: 'tool', name: 'actions_run', phase: 'start' });
    expect(screen.getByText('actions_run …')).toBeInTheDocument();
    emit({ type: 'text', text: 'Hi there' });
    emit({ type: 'done' });
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('actions_run ✕')).toBeInTheDocument();
  });

  it('starts the agent on the first character typed (not on focus), with the settings', async () => {
    const { aiAgent } = setupAgent();
    setupWidgetSut(widgetComp, settings({ model: 'haiku' }), { mockWidgetApi: { aiAgent } });
    await act(async () => { fireEvent.focus(input()); });
    expect(aiAgent.warm).not.toHaveBeenCalled();
    await act(async () => { type('h'); });
    await act(async () => { type('hi'); });
    expect(aiAgent.warm).toHaveBeenCalledTimes(1);
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'claude', model: 'haiku' });
  });

  it('shows the answer as markdown and opens its links in the browser', async () => {
    const { aiAgent, emit } = setupAgent();
    const shell = { openExternalUrl: jest.fn(async () => undefined) };
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, shell } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    emit({ type: 'textDelta', text: '**Done.** See [docs](https://example.com/d).' });
    emit({ type: 'done' });
    expect(screen.getByText('Done.').tagName).toBe('STRONG');
    fireEvent.click(screen.getByRole('link', { name: 'docs' }));
    expect(shell.openExternalUrl).toHaveBeenCalledWith('https://example.com/d');
  });

  it('shows the answer as plain text while it streams, and as markdown once the turn ends', async () => {
    const { aiAgent, emit } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    emit({ type: 'textDelta', text: '**Done**' });
    expect(screen.getByText('**Done**')).toBeInTheDocument();
    emit({ type: 'done' });
    expect(screen.getByText('Done').tagName).toBe('STRONG');
  });

  it('keeps the transcript of a copied widget but not its CLI conversation (two widgets would share it)', async () => {
    const { aiAgent } = setupAgent();
    const saved = { owner: 'OTHER-WIDGET', tool: 'claude', sessionId: 'S', items: [{ kind: 'user', text: 'copied' }] };
    const dataStorage = { getJson: jest.fn(async () => saved), setJson: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) };
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage }, widgetId: 'W1' });
    expect(await screen.findByText('copied')).toBeInTheDocument();
    type('next');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'claude' });
    expect(aiAgent.send).toHaveBeenCalledWith('C1', { tool: 'claude', prompt: 'next' });
  });

  it('puts the text back in the input when the chat did not take it', async () => {
    const { aiAgent } = setupAgent();
    let load: (v: unknown) => void = () => undefined;
    const dataStorage = {
      getJson: jest.fn(() => new Promise(r => { load = r; })), setJson: jest.fn(async () => undefined), remove: jest.fn(async () => undefined)
    };
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    type('keep me');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveValue('');
    await waitFor(() => expect(items.length).toBe(1));
    act(() => { items[0].doAction(); });
    await act(async () => { load(undefined); });
    expect(input()).toHaveValue('keep me');
  });

  it('keeps the place of a reader who scrolled up while an answer streams', async () => {
    const { aiAgent, emit } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 200 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    emit({ type: 'textDelta', text: 'more' });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(log.scrollTop).toBe(100);
    log.scrollTop = 800;
    fireEvent.scroll(log);
    emit({ type: 'textDelta', text: ' and more' });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(log.scrollTop).toBe(1000);
  });

  it('looks for a missing CLI again when the input gets focus (the user may have installed it)', async () => {
    const { aiAgent } = setupAgent({ claude: false, codex: true });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    expect(await screen.findByText(/Claude Code is not installed/)).toBeInTheDocument();
    aiAgent.detect.mockResolvedValue({ claude: true, codex: true });
    await act(async () => { fireEvent.focus(input()); });
    await waitFor(() => expect(screen.queryByText(/Claude Code is not installed/)).not.toBeInTheDocument());
  });

  it('does not start a CLI that is not installed when the input gets focus', async () => {
    const { aiAgent } = setupAgent({ claude: false, codex: true });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    expect(await screen.findByText(/Claude Code is not installed/)).toBeInTheDocument();
    await act(async () => { fireEvent.focus(input()); });
    await act(async () => { type('h'); });
    expect(aiAgent.warm).not.toHaveBeenCalled();
  });

  it('marks the conversation busy for screen readers while an answer streams', async () => {
    const { aiAgent, emit } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');
    emit({ type: 'done' });
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'false');
  });

  it('a deleted widget whose view renders once more gets an empty session that loads nothing (no session is kept for it)', async () => {
    const { aiAgent } = setupAgent();
    const saved = { owner: 'W9', tool: 'claude', items: [{ kind: 'user', text: 'old' }] };
    const dataStorage = { getJson: jest.fn(async () => saved), setJson: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) };
    forgetChatSession('W9');
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage }, widgetId: 'W9' });
    await act(async () => undefined);
    expect(dataStorage.getJson).not.toHaveBeenCalled();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('does not send on Shift+Enter or while an IME composes', async () => {
    const { aiAgent } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    type('안녕');
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(aiAgent.send).not.toHaveBeenCalled();
  });

  it('offers Stop while a turn runs', async () => {
    const { aiAgent } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    type('hello');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(aiAgent.cancel).toHaveBeenCalledWith('C1');
  });

  it('keeps the conversation when the widget unmounts and mounts again', async () => {
    const { aiAgent, emit } = setupAgent();
    const first = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent }, widgetId: 'W1' });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    first.comp.unmount();
    emit({ type: 'text', text: 'answered while away' });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent }, widgetId: 'W1' });
    expect(screen.getByText('answered while away')).toBeInTheDocument();
  });

  it('does not offer input in the settings preview (it shares the widget id)', async () => {
    const { aiAgent } = setupAgent();
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent }, env: { area: 'shelf', isPreview: true } });
    expect(screen.getByText(/runs in the widget/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('ends the conversation and its CLI when the widget is deleted', async () => {
    const { aiAgent } = setupAgent();
    const sut = setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent }, widgetId: 'W1' });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    sut.comp.unmount();
    aiChatType.onDeleted?.('W1');
    expect(aiAgent.end).toHaveBeenCalledWith('C1');
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent }, widgetId: 'W1' });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('shows the saved conversation and saves it again when a turn ends', async () => {
    const { aiAgent, emit } = setupAgent();
    const saved = { owner: 'WIDGET-ID', tool: 'claude', sessionId: 's-old', items: [{ kind: 'user', text: 'earlier question' }, { kind: 'bogus' }, { kind: 'assistant' }] };
    const dataStorage = { getJson: jest.fn(async () => saved), setJson: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) };
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage } });
    expect(await screen.findByText('earlier question')).toBeInTheDocument();
    type('next');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'claude', resume: 's-old' });
    expect(aiAgent.send).toHaveBeenCalledWith('C1', { tool: 'claude', prompt: 'next' });
    emit({ type: 'done', sessionId: 's-old' });
    expect(dataStorage.setJson).toHaveBeenLastCalledWith('chat', {
      owner: 'WIDGET-ID', tool: 'claude', sessionId: 's-old', items: [{ kind: 'user', text: 'earlier question' }, { kind: 'user', text: 'next' }]
    });
  });

  it('starts empty when the save is not a conversation', async () => {
    const { aiAgent } = setupAgent();
    const dataStorage = { getJson: jest.fn(async () => ({ tool: 'rm -rf', items: 'x' })), setJson: jest.fn(), remove: jest.fn() };
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage } });
    type('hi');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'claude' });
    expect(aiAgent.send).toHaveBeenCalledWith('C1', { tool: 'claude', prompt: 'hi' });
  });

  it('drops a saved conversation id that is not a plain id (main would refuse it on every send)', async () => {
    const { aiAgent } = setupAgent();
    const saved = { owner: 'WIDGET-ID', tool: 'claude', sessionId: 'a.b:c', items: [] };
    const dataStorage = { getJson: jest.fn(async () => saved), setJson: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) };
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, dataStorage } });
    type('hi');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    expect(aiAgent.warm).toHaveBeenCalledWith(null, { tool: 'claude' });
    expect(aiAgent.send).toHaveBeenCalledWith('C1', { tool: 'claude', prompt: 'hi' });
  });

  it('says when the selected CLI is not installed', async () => {
    const { aiAgent } = setupAgent({ claude: false, codex: true });
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent } });
    expect(await screen.findByText(/Claude Code is not installed/)).toBeInTheDocument();
  });

  it('has a New Conversation action that clears the messages', async () => {
    const { aiAgent } = setupAgent();
    let items: ActionBarItems = [];
    setupWidgetSut(widgetComp, settings(), { mockWidgetApi: { aiAgent, updateActionBar: (i: ActionBarItems) => { items = i; } } });
    type('hello');
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }); });
    await waitFor(() => expect(items.length).toBe(1));
    act(() => { items[0].doAction(); });
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    expect(aiAgent.end).toHaveBeenCalledWith('C1');
  });
});
