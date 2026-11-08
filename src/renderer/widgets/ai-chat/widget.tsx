/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { KeyboardEvent, MouseEvent, memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActionBarItems, ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { AiAgentProvider } from '@/application/interfaces/aiAgentProvider';
import { Settings, toolName } from './settings';
import { ChatItem, ChatSession, ChatStore, SavedChat, createChatSession } from './session';
import { agentTools, AgentTool, isSafeAgentId } from '@common/ai/agent';
import { newSvg } from './icons';
import { renderMarkdown } from './markdown';
import { asRecord } from '@/application/useCases/ai/actions/inputs';
import styles from './widget.module.scss';

/**
 * Conversations outlive the widget's view: Memory Saver unmounts unused workflows while
 * a turn may still run. A deleted widget's conversation ends (forgetChatSession). The
 * transcript and the CLI conversation id are saved in the widget's data (key 'chat').
 */
const sessionByWidget = new Map<string, ChatSession>();
/** Deleted widgets: a view that renders once more before it unmounts gets the empty session. ponytail: ids are never reused. */
const deletedWidgets = new Set<string>();
/** No store: a load of the save would render the view again, and each render would make a new session. */
let emptySession: ChatSession | undefined;

/** The widget was deleted: its conversation and CLI end. */
export function forgetChatSession(widgetId: string): void {
  deletedWidgets.add(widgetId);
  sessionByWidget.get(widgetId)?.close();
  sessionByWidget.delete(widgetId);
}

/** For tests. */
export function resetChatSessions(): void {
  sessionByWidget.clear();
  deletedWidgets.clear();
  emptySession = undefined;
}

const CHAT_KEY = 'chat';
const itemKinds = ['user', 'assistant', 'tool', 'error', 'note'];
const toolStates = ['running', 'ok', 'failed'];

/** The save is read back from disk: keep only well-formed items. */
function readSavedChat(v: unknown): SavedChat | undefined {
  const o = asRecord(v);
  if (!o || !agentTools.includes(o.tool as AgentTool) || !Array.isArray(o.items)) {
    return undefined;
  }
  const items = o.items.filter((i): i is ChatItem => {
    const it = asRecord(i);
    if (!it || !itemKinds.includes(it.kind as string)) {
      return false;
    }
    return it.kind === 'tool' ? typeof it.name === 'string' && toolStates.includes(it.state as string) : typeof it.text === 'string';
  }).map(i => (i.kind === 'tool' && i.state === 'running' ? { ...i, state: 'failed' as const } : i));
  // Main refuses any other id (it goes on a command line): such an id would fail every send.
  const sessionId = typeof o.sessionId === 'string' && isSafeAgentId(o.sessionId) ? o.sessionId : undefined;
  return { tool: o.tool as AgentTool, ...(sessionId ? { sessionId } : {}), items };
}

function getSession(id: string, api: AiAgentProvider, dataStorage: WidgetReactComponentProps<Settings>['widgetApi']['dataStorage']): ChatSession {
  if (deletedWidgets.has(id)) {
    emptySession ??= createChatSession(api);
    return emptySession;
  }
  let s = sessionByWidget.get(id);
  if (!s) {
    const store: ChatStore = {
      load: async () => {
        const raw = await dataStorage.getJson(CHAT_KEY);
        const chat = readSavedChat(raw);
        // A copied widget gets the data too: it keeps the transcript, not the CLI conversation (two widgets would share it).
        const owner = asRecord(raw)?.owner;
        return chat && owner !== id ? { tool: chat.tool, items: chat.items } : chat;
      },
      save: chat => {
        // A failed save loses only the transcript on disk; the conversation goes on.
        Promise.resolve(chat ? dataStorage.setJson(CHAT_KEY, { owner: id, ...chat }) : dataStorage.remove(CHAT_KEY)).catch(() => undefined);
      },
    };
    s = createChatSession(api, store);
    sessionByWidget.set(id, s);
  }
  return s;
}

/** Memo: a streamed answer changes only the last item; the others keep their objects. */
const Item = memo(function Item({item, streaming}: {item: ChatItem; streaming?: boolean}) {
  switch (item.kind) {
    case 'tool':
      return <div className={styles['tool']}>{item.name || 'tool'}{item.state === 'running' ? ' …' : item.state === 'failed' ? ' ✕' : ' ✓'}</div>;
    case 'assistant':
      if (streaming) {
        // Parsed once the turn ends: parsing the whole answer per streamed token grows with its length squared.
        return <div className={styles['streaming']}>{item.text}</div>;
      }
      // renderMarkdown shows raw HTML as text and keeps only http(s)/mailto links.
      return <div className={styles['assistant']} dangerouslySetInnerHTML={{ __html: renderMarkdown(item.text) }}/>;
    case 'error':
      return <div className={styles['error']} role="alert">{item.text}</div>;
    default:
      return <div className={styles[item.kind]}>{item.text}</div>;
  }
});

function LiveChat({id, settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const {aiAgent, shell, dataStorage, updateActionBar} = widgetApi;
  const session = getSession(id, aiAgent, dataStorage);
  const {items, running, first} = useSyncExternalStore(session.subscribe, session.get);
  const [draft, setDraft] = useState('');
  const [installed, setInstalled] = useState<boolean | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const liveRef = useRef(true);
  const detect = useCallback(() => {
    aiAgent.detect().then(found => {
      if (liveRef.current) {
        setInstalled(found[settings.tool]);
      }
    }).catch(() => undefined);
  }, [aiAgent, settings.tool]);
  useEffect(() => {
    liveRef.current = true;
    detect();
    return () => {
      liveRef.current = false;
    };
  }, [detect]);

  // Follows new text only while the reader is at the bottom; once per frame (tokens come faster).
  const atBottomRef = useRef(true);
  useEffect(() => {
    if (!atBottomRef.current) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [items]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }
  };

  useEffect(() => {
    const actionBarItems: ActionBarItems = [
      { id: 'NEW-CONVERSATION', icon: newSvg, title: 'New Conversation', doAction: async () => session.reset() },
    ];
    updateActionBar(actionBarItems);
  }, [updateActionBar, session]);

  const send = () => {
    if (running || draft.trim() === '') {
      return;
    }
    const prompt = draft;
    setDraft('');
    session.send(prompt, settings).then(taken => {
      // Not taken (e.g. New Conversation came first): the text goes back unless the user typed again.
      if (!taken) {
        setDraft(d => (d === '' ? prompt : d));
      }
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an IME composes (Korean, Japanese...) only ends the composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  // Links in answers open in the browser; the app page never navigates.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    if (link) {
      e.preventDefault();
      if (link.hasAttribute('data-external')) {
        shell.openExternalUrl(link.getAttribute('href') ?? '');
      }
    }
  };

  const name = toolName(settings.tool);
  return (
    <div className={styles['chat']}>
      <div ref={listRef} className={styles['messages']} role="log" aria-label="Conversation" aria-busy={running} onClick={onClick} onScroll={onScroll}>
        {installed === false && <div className={styles['error']} role="alert">{name} is not installed (not found on PATH).</div>}
        {items.length === 0 && installed !== false && <div className={styles['empty']}>Ask {name} anything, or ask it to work in Freeter.</div>}
        {items.map((item, i) => <Item key={first + i} item={item} streaming={running && i === items.length - 1}/>)}
      </div>
      <div className={styles['input-bar']}>
        <textarea
          className={styles['input']}
          aria-label="Message"
          placeholder={`Message ${name} (Enter sends, Shift+Enter: new line)`}
          value={draft}
          onChange={e => {
            // The CLI starts on the first character (it takes seconds to start), not on a focus that sends nothing.
            if (draft === '' && e.target.value !== '' && installed !== false) {
              void session.warm(settings);
            }
            setDraft(e.target.value);
          }}
          onKeyDown={onKeyDown}
          // A CLI that was not installed is looked for again (main keeps a missing one for a few seconds).
          onFocus={() => (installed === false ? detect() : undefined)}
        />
        {running
          ? <button type="button" className={styles['button']} onClick={() => session.cancel()}>Stop</button>
          : <button type="button" className={styles['button']} onClick={send} disabled={draft.trim() === ''}>Send</button>}
      </div>
    </div>
  );
}

/** The settings screen previews the widget with the same id: a live view there would share the widget's conversation. */
function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  if (props.env.isPreview) {
    return <div className={styles['empty']}>The conversation runs in the widget.</div>;
  }
  return <LiveChat {...props}/>;
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
