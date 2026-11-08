/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEffort, AgentEvent, AgentSendRequest, AgentTool } from '@common/ai/agent';
import { AiAgentProvider } from '@/application/interfaces/aiAgentProvider';
import { toolName } from '@/widgets/ai-chat/settings';

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; state: 'running' | 'ok' | 'failed' }
  | { kind: 'error'; text: string }
  | { kind: 'note'; text: string };

export interface ChatState {
  items: ChatItem[];
  /** Place of items[0] in the whole conversation (older items left memory): a stable key for a view. */
  first: number;
  /** A turn is running: input waits, Stop is offered. */
  running: boolean;
}

export interface ChatOptions {
  tool: AgentTool;
  model: string;
  effort: AgentEffort | '';
}

/** What is kept on disk: the transcript, and the CLI conversation to continue after an app restart. */
export interface SavedChat {
  tool: AgentTool;
  sessionId?: string;
  items: ChatItem[];
}

export interface ChatStore {
  load(): Promise<SavedChat | undefined>;
  /** undefined removes the save (new conversation). */
  save(chat: SavedChat | undefined): void;
}

const MAX_SAVED_ITEMS = 200;
/** Older items leave memory too: each streamed token copies the list. */
const MAX_ITEMS = 500;

const optionsOf = (o: ChatOptions, resume?: string): Omit<AgentSendRequest, 'prompt'> =>
  ({ tool: o.tool, ...(o.model ? { model: o.model } : {}), ...(o.effort ? { effort: o.effort } : {}), ...(resume ? { resume } : {}) });

/**
 * One conversation with an agent CLI. It lives outside the widget's view (the view can
 * unmount while a turn runs) and keeps a new state object per change for useSyncExternalStore.
 */
export function createChatSession(api: AiAgentProvider, store?: ChatStore) {
  let state: ChatState = { items: [], running: false, first: 0 };
  let conversationId: string | null = null;
  let tool: AgentTool | undefined;
  /** A conversation was had with `tool` (a saved one, or a send main took): switching the tool leaves it (a note says so). */
  let talked = false;
  let stopListening: (() => void) | undefined;
  /** Bumped by reset: a send or warm still waiting for main belongs to the old conversation. */
  let epoch = 0;
  /** A warm waiting for its conversation id; a send waits for it so both use one conversation. */
  let warming: Promise<void> | undefined;
  /** Stop came while the first send waited for its conversation id: that turn is stopped once the id comes. */
  let stopWanted = false;
  const subscribers = new Set<() => void>();
  /** The CLI conversation of the transcript: continued by the next new conversation of the same tool. */
  let resumable: { tool: AgentTool; sessionId: string } | undefined;
  /** The id main reported for the current conversation (it can change when the CLI resumes). */
  let lastSessionId: string | undefined;

  const set = (items: ChatItem[], running: boolean) => {
    const over = Math.max(0, items.length - MAX_ITEMS);
    state = { items: over > 0 ? items.slice(over) : items, running, first: state.first + over };
    subscribers.forEach(fn => fn());
  };
  // Saved when a turn ends (not per streamed token).
  const persist = () => {
    const t = tool ?? resumable?.tool;
    if (store && t) {
      const sessionId = lastSessionId ?? resumable?.sessionId;
      store.save({ tool: t, ...(sessionId ? { sessionId } : {}), items: state.items.slice(-MAX_SAVED_ITEMS) });
    }
  };
  const loaded: Promise<void> = (store?.load() ?? Promise.resolve(undefined)).then(saved => {
    // Not after New Conversation (epoch moved) or once the conversation started.
    if (!saved || epoch !== 0 || state.items.length > 0) {
      return;
    }
    resumable = saved.sessionId ? { tool: saved.tool, sessionId: saved.sessionId } : undefined;
    tool = saved.tool;
    talked = saved.items.length > 0;
    set(saved.items, false);
  }).catch(() => undefined); // a broken save starts empty
  const add = (item: ChatItem, running = state.running) => set([...state.items, item], running);
  /** A tool call that never reported its end (the turn stopped) counts as failed. */
  const closeTools = (items: ChatItem[]) => items.map(i => (i.kind === 'tool' && i.state === 'running' ? { ...i, state: 'failed' as const } : i));

  const onEvent = (e: AgentEvent) => {
    const items = state.items;
    const last = items[items.length - 1];
    switch (e.type) {
      case 'text':
        // A new paragraph (Claude Code starts it empty and streams it with textDelta).
        if (last?.kind === 'assistant') {
          set([...items.slice(0, -1), { kind: 'assistant', text: last.text === '' ? e.text : `${last.text}\n\n${e.text}` }], state.running);
        } else {
          add({ kind: 'assistant', text: e.text });
        }
        return;
      case 'textDelta':
        if (last?.kind === 'assistant') {
          set([...items.slice(0, -1), { kind: 'assistant', text: last.text + e.text }], state.running);
        } else {
          add({ kind: 'assistant', text: e.text });
        }
        return;
      case 'tool':
        if (e.phase === 'start') {
          add({ kind: 'tool', name: e.name, state: 'running' });
        } else {
          // Codex names the call that ended; Claude does not: then the oldest open call is closed.
          const open = (it: ChatItem) => it.kind === 'tool' && it.state === 'running';
          const named = e.name ? items.findIndex(it => open(it) && it.kind === 'tool' && it.name === e.name) : -1;
          const i = named >= 0 ? named : items.findIndex(open);
          if (i >= 0) {
            set(items.map((it, j) => (j === i ? { ...it, state: e.ok === false ? 'failed' : 'ok' } as ChatItem : it)), state.running);
          }
        }
        return;
      case 'done':
        lastSessionId = e.sessionId ?? lastSessionId;
        set(closeTools(items), false);
        persist();
        return;
      case 'session':
        lastSessionId = e.sessionId;
        resumable = undefined;
        persist();
        return;
      case 'notice':
        add({ kind: 'note', text: e.message });
        if (e.sessionLost) {
          lastSessionId = undefined;
          resumable = undefined;
          persist(); // the lost id leaves the save now, not only when the turn ends
        }
        return;
      case 'error':
        if (e.sessionId) {
          lastSessionId = e.sessionId;
        }
        set([...closeTools(items), { kind: 'error', text: e.message }], false);
        persist();
        return;
    }
  };

  const listen = (id: string, t: AgentTool) => {
    stopListening?.();
    // The saved CLI conversation now lives on in this one.
    if (resumable?.tool === t) {
      lastSessionId ??= resumable.sessionId;
    }
    resumable = undefined;
    // Before subscribing: the provider hands kept events over at once, and saving them needs the tool.
    conversationId = id;
    tool = t;
    talked = true;
    stopListening = api.onEvent(id, onEvent);
  };

  const resumeFor = (t: AgentTool) => (resumable?.tool === t ? resumable.sessionId : undefined);

  const forget = () => {
    stopListening?.();
    stopListening = undefined;
    conversationId = null;
  };

  /** The widget was deleted: its CLI conversation ends; the save stays (a copy pasted later reads it). */
  const close = () => {
    if (conversationId !== null) {
      api.end(conversationId);
    }
    epoch++;
    forget();
  };

  return {
    get: () => state,
    subscribe(fn: () => void): () => void {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    /** Starts the agent before the first prompt (input focus): Claude Code takes seconds to start. */
    async warm(o: ChatOptions): Promise<void> {
      const sentIn = epoch;
      await loaded;
      // Another tool than the conversation's (also a saved one): the send switches, with a note.
      if (sentIn !== epoch || state.running || warming || (tool !== undefined && tool !== o.tool)) {
        return;
      }
      const p = (async () => {
        let res;
        try {
          res = await api.warm(conversationId, optionsOf(o, conversationId === null ? resumeFor(o.tool) : undefined));
        } catch {
          return; // the send reports problems
        }
        if (sentIn !== epoch) {
          if (res.ok) {
            api.end(res.conversationId);
          }
          return;
        }
        if (res.ok && res.conversationId !== conversationId) {
          listen(res.conversationId, o.tool);
        }
      })();
      warming = p;
      await p;
      if (warming === p) {
        warming = undefined;
      }
    },

    /** Resolves false when the prompt was not taken (empty, a turn runs, or New Conversation came first). */
    async send(prompt: string, o: ChatOptions): Promise<boolean> {
      // A reset while this waits (load, warm, main) drops the send.
      const sentIn = epoch;
      await loaded;
      if (warming) {
        await warming;
      }
      if (sentIn !== epoch || state.running || prompt.trim() === '') {
        return false;
      }
      // A conversation (also a saved one) stays with the tool it started with.
      if (tool !== undefined && tool !== o.tool) {
        if (conversationId !== null) {
          api.end(conversationId);
        }
        resumable = undefined;
        lastSessionId = undefined;
        forget();
        if (talked && state.items.length > 0) {
          add({ kind: 'note', text: `New conversation with ${toolName(o.tool)}` });
        }
        talked = false;
      }
      // Now, not when main answers: a failed send must not switch (and note it) again on the next try.
      tool = o.tool;
      add({ kind: 'user', text: prompt }, true);
      persist(); // the prompt survives an app quit during the turn
      stopWanted = false;
      let res;
      try {
        res = await api.send(conversationId, { ...optionsOf(o, conversationId === null ? resumeFor(o.tool) : undefined), prompt });
      } catch (err) {
        res = { ok: false as const, message: err instanceof Error ? err.message : String(err) };
      }
      if (sentIn !== epoch) {
        if (res.ok) {
          api.end(res.conversationId);
        }
        return true;
      }
      if (!res.ok) {
        add({ kind: 'error', text: res.message }, false);
        persist();
        return true;
      }
      if (res.conversationId !== conversationId) {
        // Events that came before this answer were kept by the provider and come on subscribe.
        listen(res.conversationId, o.tool);
      }
      if (stopWanted) {
        stopWanted = false;
        api.cancel(res.conversationId);
      }
      return true;
    },

    // ponytail: if a turn's done/error event never arrived, Stop does nothing (main has no turn to cancel); New Conversation recovers.
    cancel(): void {
      if (!state.running) {
        return;
      }
      if (conversationId !== null) {
        api.cancel(conversationId);
      } else {
        stopWanted = true;
      }
    },

    /** New conversation: the agent forgets what was said, and its CLI ends. */
    reset(): void {
      close();
      warming = undefined; // the old warm-up ends its CLI by itself (epoch moved); a send does not wait for it
      tool = undefined;
      talked = false;
      resumable = undefined;
      lastSessionId = undefined;
      state = { ...state, first: 0 };
      set([], false);
      store?.save(undefined);
    },

    close,
  };
}

export type ChatSession = ReturnType<typeof createChatSession>;
