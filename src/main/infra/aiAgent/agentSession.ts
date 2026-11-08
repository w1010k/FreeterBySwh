/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEvent, AgentTool } from '@common/ai/agent';
import { encodeLine } from '@common/ai/protocol';
import { Json, obj, parse, parseClaudeLine, str } from '@/infra/aiAgent/agentEvents';

/** What one output line of the CLI means for the runner. */
export interface AgentRead {
  /** For the running turn (dropped when none runs). */
  events: AgentEvent[];
  /** The id to resume the conversation with (Claude session id / Codex thread id). */
  sessionId?: string;
  /** A notice to show if the CLI then stops without an answer (Codex error notices; most are retries). */
  note?: string;
  /** To write back to the CLI (an answer to its request). */
  reply?: string;
  /** The CLI can take prompts now (a prompt that came earlier was held). */
  ready?: boolean;
  /** The process is of no use: end it. */
  end?: boolean;
  /** The CLI conversation to continue is gone (the runner starts a new one and says so). */
  sessionLost?: true;
}

/** The talk with one long-lived CLI process: what to write, and what its output means. */
export interface AgentSession {
  /** Written once the process started. */
  start(): string;
  /** The prompt to write; undefined while the CLI is not ready (the runner holds it until `ready`). */
  prompt(text: string): string | undefined;
  /** Stops the running turn inside the CLI; undefined when it cannot (the process is ended instead). */
  interrupt(): string | undefined;
  /** A Stop was sent and its turn has not ended yet (prompts are held meanwhile). */
  stopping(): boolean;
  read(line: string): AgentRead;
}

const line = (o: object) => encodeLine({ jsonrpc: '2.0', ...o });

/** Claude Code `-p --input-format stream-json`: prompts are user messages, one per line. */
function claudeSession(resumeId?: string): AgentSession {
  /** Text deltas came since the last complete message: its text was shown already. */
  let streamed = false;
  /** A Stopped turn still ending: its output is dropped and the next prompt waits for its result line. */
  let stopping = false;
  /** Freeter tool calls in progress: a Stop then ends the process (see codexSession). */
  let toolsRunning = 0;
  /**
   * The current turn produced output. Before that the prompt may still wait in the CLI's queue, where an
   * interrupt finds nothing to stop and the turn would still run: a Stop then ends the process.
   */
  let turnStarted = false;
  let nextRequest = 1;
  return {
    start: () => '',
    prompt(text) {
      if (stopping) {
        return undefined;
      }
      turnStarted = false;
      return encodeLine({ type: 'user', message: { role: 'user', content: text } });
    },
    interrupt() {
      if (toolsRunning > 0 || !turnStarted) {
        return undefined;
      }
      stopping = true;
      // Verified with Claude Code 2.1.319: the turn ends with an error result and the process takes the next prompt.
      return encodeLine({ type: 'control_request', request_id: `stop-${nextRequest++}`, request: { subtype: 'interrupt' } });
    },
    stopping: () => stopping,
    read(text) {
      const { events, sessionId, message, sessionNotFound, turnOutput } = parseClaudeLine(text);
      turnStarted ||= turnOutput === true;
      if (sessionNotFound && resumeId) {
        // This process was started for that session: the next turn needs a fresh one.
        return { events: [], sessionLost: true, end: true };
      }
      for (const e of events) {
        if (e.type === 'tool') {
          toolsRunning = Math.max(0, toolsRunning + (e.phase === 'start' ? 1 : -1));
        }
      }
      if (events.some(e => e.type === 'done')) {
        toolsRunning = 0;
        streamed = false;
        if (stopping) {
          stopping = false;
          return { events: [], ...(sessionId ? { sessionId } : {}), ready: true };
        }
      }
      if (stopping) {
        return { events: [], ...(sessionId ? { sessionId } : {}) };
      }
      let out = events;
      if (message) {
        out = streamed ? events.filter(e => e.type !== 'text') : events;
        streamed = false;
      } else if (events.some(e => e.type === 'textDelta')) {
        streamed = true;
      }
      return { events: out, ...(sessionId ? { sessionId } : {}) };
    },
  };
}

/**
 * Codex `app-server` (JSON-RPC 2.0, one message per line; experimental in Codex 0.164.0,
 * verified 2026-11-08). One thread per conversation: read-only sandbox, no approval prompts
 * (Freeter asks the user itself before a Freeter tool changes anything).
 */
function codexSession(resumeId?: string): AgentSession {
  const THREAD_REQ = 2;
  let nextId = THREAD_REQ + 1;
  let threadId: string | undefined;
  let turnReq: number | undefined;
  let turnId: string | undefined;
  /** Interrupted turns: what they still send is dropped. */
  const dropped = new Set<string>();
  /** A Stopped turn still ending inside Codex: the next turn waits for it. */
  let stopping: string | undefined;
  /** Answer items that streamed deltas (their completed text was shown already). */
  const streamedItems = new Set<string>();
  /**
   * Tool calls in progress. Stopping then ends the process: an interrupt would leave the call (and the
   * Freeter confirm box it waits on) running; ending `freeter mcp` closes that box.
   */
  let toolsRunning = 0;
  /** The current turn (turnId) completed. */
  let turnDone = false;
  const threadParams = {
    sandbox: 'read-only',
    approvalPolicy: 'never',
    // Without this Codex looks around its empty work folder first (seconds per turn).
    developerInstructions: 'You are the assistant inside the Freeter app. To read or change Freeter (projects, workflows, widgets, '
      + 'notes, to-dos, settings), use the freeter MCP tools.',
  };

  const isTool = (item: Json | undefined) => item?.type === 'mcpToolCall' || item?.type === 'commandExecution';

  const itemEvents = (item: Json | undefined, phase: 'start' | 'end'): AgentEvent[] => {
    switch (item?.type) {
      case 'agentMessage': {
        if (phase === 'start') {
          return [{ type: 'text', text: '' }];
        }
        const whole = str(item.text);
        return whole && !streamedItems.has(str(item.id) ?? '') ? [{ type: 'textDelta', text: whole }] : [];
      }
      case 'mcpToolCall':
      case 'commandExecution': {
        const name = item.type === 'mcpToolCall' ? str(item.tool) ?? '' : 'shell';
        return [phase === 'start' ? { type: 'tool', name, phase } : { type: 'tool', name, phase, ok: item.status !== 'failed' }];
      }
      default:
        return [];
    }
  };

  return {
    start: () => line({ id: 1, method: 'initialize', params: { clientInfo: { name: 'freeter', title: 'Freeter', version: '1' }, capabilities: null } })
      + line({ method: 'initialized' })
      + line(resumeId
        ? { id: THREAD_REQ, method: 'thread/resume', params: { threadId: resumeId, ...threadParams } }
        : { id: THREAD_REQ, method: 'thread/start', params: threadParams }),

    prompt(text) {
      if (!threadId || stopping) {
        return undefined;
      }
      turnReq = nextId++;
      turnId = undefined;
      turnDone = false;
      toolsRunning = 0;
      return line({ id: turnReq, method: 'turn/start', params: { threadId, input: [{ type: 'text', text, text_elements: [] }] } });
    },

    interrupt() {
      if (!threadId || !turnId || toolsRunning > 0) {
        return undefined;
      }
      dropped.add(turnId);
      stopping = turnId;
      return line({ id: nextId++, method: 'turn/interrupt', params: { threadId, turnId } });
    },

    stopping: () => stopping !== undefined,

    read(text) {
      const o = parse(text);
      if (!o) {
        return { events: [] };
      }
      const method = str(o.method);
      if (o.id !== undefined && method) {
        // A request from the CLI (approval, question): with this thread's settings none is expected; declining keeps the turn going.
        return { events: [], reply: line({ id: o.id, error: { code: -32601, message: 'Freeter does not answer this request' } }) };
      }
      const error = str(obj(o.error)?.message);
      if (o.id === THREAD_REQ) {
        threadId = str(obj(obj(o.result)?.thread)?.id);
        // Codex saves a new thread only once a turn starts in it (verified, also when the process is killed mid-turn):
        // its id is given then.
        return threadId
          ? { events: [], ...(resumeId ? { sessionId: threadId } : {}), ready: true }
          // Only a missing thread is lost; other errors (auth, network) keep it for the next try (verified with Codex 0.164.0).
          : resumeId && error?.startsWith('no rollout found')
            ? { events: [], sessionLost: true, end: true }
            : { events: [{ type: 'error', message: `Codex could not open the conversation: ${error ?? 'no thread'}` }], end: true };
      }
      if (o.id !== undefined && o.id === turnReq) {
        turnId = str(obj(obj(o.result)?.turn)?.id) ?? turnId;
        return { events: error ? [{ type: 'error', message: error }] : [], ...(turnId ? { sessionId: threadId } : {}) };
      }
      const params = obj(o.params);
      const turn = obj(params?.turn);
      const ofTurn = str(params?.turnId) ?? str(turn?.id);
      if (ofTurn && dropped.has(ofTurn)) {
        if (method === 'turn/completed') {
          // No newer turn runs yet: the next prompt waited for this.
          dropped.delete(ofTurn);
          toolsRunning = 0;
          streamedItems.clear();
        }
        if (method === 'turn/completed' && ofTurn === stopping) {
          stopping = undefined;
          return { events: [], sessionId: threadId, ready: true };
        }
        return { events: [] };
      }
      switch (method) {
        case 'item/started':
          toolsRunning += isTool(obj(params?.item)) ? 1 : 0;
          return { events: itemEvents(obj(params?.item), 'start') };
        case 'item/completed':
          toolsRunning = Math.max(0, toolsRunning - (isTool(obj(params?.item)) ? 1 : 0));
          return { events: itemEvents(obj(params?.item), 'end') };
        case 'item/agentMessage/delta': {
          streamedItems.add(str(params?.itemId) ?? '');
          const delta = str(params?.delta);
          return { events: delta ? [{ type: 'textDelta', text: delta }] : [] };
        }
        case 'turn/completed':
          if (ofTurn === turnId) {
            turnDone = true;
          }
          // A turn can end with a tool call still open (failed); its count and streamed items are of no more use.
          toolsRunning = 0;
          streamedItems.clear();
          if (turn?.status === 'completed') {
            return { events: [{ type: 'done', sessionId: threadId }], sessionId: threadId };
          }
          return {
            events: [{ type: 'error', message: turn?.status === 'failed' ? str(obj(turn.error)?.message) ?? 'Codex failed' : 'Codex stopped the answer' }],
            sessionId: threadId,
          };
        case 'error': {
          const note = str(obj(params?.error)?.message);
          // Only the running turn: a turn that completed already leaves nothing to wait for.
          if (params?.willRetry === false && ofTurn && ofTurn === turnId && !turnDone) {
            // The turn failed: end it now, not on a turn/completed that may not come (that one is dropped).
            // Like a Stop, the next prompt waits for that completion: Codex merges a turn/start sent while a turn
            // runs into that turn (verified with 0.164.0), whose output is dropped. The runner gives up after a while.
            dropped.add(ofTurn);
            stopping = ofTurn;
            return { events: [{ type: 'error', message: note ?? 'Codex failed' }] };
          }
          return note ? { events: [], note } : { events: [] };
        }
        default:
          return { events: [] };
      }
    },
  };
}

export function createAgentSession(tool: AgentTool, sessionId?: string): AgentSession {
  return tool === 'claude' ? claudeSession(sessionId) : codexSession(sessionId);
}
