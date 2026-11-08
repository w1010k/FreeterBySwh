/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentSession, createAgentSession } from '@/infra/aiAgent/agentSession';
import { AgentEffort, AgentEvent, AgentSendRequest, AgentTool, agentEfforts, agentTools, isSafeAgentId } from '@common/ai/agent';
import { createLineSplitter } from '@common/ai/protocol';

/** The part of a child process the runner uses. */
export interface AgentProcess {
  pid?: number;
  stdin: { write(s: string): unknown; on(event: 'error', fn: (err: Error) => void): unknown } | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'exit' | 'close', fn: (code: number | null) => void): unknown;
  on(event: 'error', fn: (err: Error) => void): unknown;
}

type Deps = {
  /** Path of the installed CLI, or undefined. */
  findProgram: (tool: AgentTool) => string | undefined;
  spawn: (program: string, args: string[]) => AgentProcess;
  /** Ends the process and its children (a CLI runs its own subprocesses). */
  kill: (proc: AgentProcess) => void;
  emit: (conversationId: string, event: AgentEvent) => void;
  argsFor: (tool: AgentTool, o: { sessionId?: string; model?: string; effort?: AgentEffort }) => string[];
  newId: () => string;
  /** Per turn; it includes the time the user takes on Freeter's confirm boxes. */
  timeoutMs: number;
  /** A CLI process with no turn for this long is ended (the next turn resumes the conversation). */
  idleMs: number;
}

export type AgentSendResult = { ok: true; conversationId: string } | { ok: false; message: string };
export type AgentWarmOptions = Omit<AgentSendRequest, 'prompt'>;

interface Turn {
  end(error?: string): void;
}

/** The conversation's running CLI, kept across turns (Claude Code stream-json input, Codex app-server). */
interface Live {
  proc: AgentProcess;
  session: AgentSession;
  /** A prompt written once the CLI is ready (Codex: its thread started). */
  queued?: string;
  turn?: Turn;
  idle?: ReturnType<typeof setTimeout>;
  /** Exited, or being ended: no new turn goes to it. */
  gone?: boolean;
  /** Ended on purpose: what it still prints is ignored (it could carry an old conversation id). */
  stopped?: boolean;
  /** It exited: no kill (Windows could have given its id to another process). */
  exited?: boolean;
  /** The time limit of a Stop or of a prompt held behind one (a later one replaces it), or of the end after an exit. */
  grace?: ReturnType<typeof setTimeout>;
  /**
   * How it was started: to start again with a new conversation when the one to continue is gone. A turn that asks
   * for another model or effort starts a new process (`reusable`).
   */
  program: string;
  options: AgentWarmOptions;
  /** The prompt of the current turn (sent again in that new conversation). */
  prompt?: string;
  /** What the CLI said during the current turn, to explain a stop without an answer. */
  stderr: string;
  note?: string;
}

/**
 * conv.turn is the conversation's running turn; live.turn stays with its process (after an exit, the process
 * still ends its own turn when its last output or the exit grace comes, while the conversation may move on).
 */
interface Conversation {
  tool: AgentTool;
  sessionId?: string;
  live?: Live;
  turn?: Turn;
}

const MAX_PROMPT = 100000;
/** After 'exit', how long a turn waits for 'close' (the rest of the output); a child holding the pipe can delay it forever. */
const EXIT_GRACE_MS = 2000;
/** A Stopped turn that has not ended after this long: the process is ended (a held prompt would wait forever). */
const STOP_GRACE_MS = 10000;
/** How long a lookup of the installed CLIs is used again (one installed meanwhile shows after this). */
const DETECT_MS = 60000;
const MISS_MS = 5000;
const NEW_CONVERSATION = 'The earlier conversation could not be continued (the CLI no longer has it); a new conversation starts.';
/** The same, found while warming up (no message sent yet). */
const NEW_CONVERSATION_NEXT = 'The earlier conversation could not be continued (the CLI no longer has it); your next message starts a new one.';
// Model names go on a command line (through cmd.exe for .cmd CLIs): letters, digits and ._:-[] only.
const safeModel = /^[A-Za-z0-9._:[\]-]{1,100}$/;

const keyOf = (o: AgentWarmOptions) => `${o.model || ''}|${o.effort ?? ''}`;

function checkOptions(o: AgentWarmOptions): string | undefined {
  if (!agentTools.includes(o.tool)) {
    return 'Unknown tool';
  }
  if (o.model !== undefined && o.model !== '' && (typeof o.model !== 'string' || !safeModel.test(o.model))) {
    return 'Invalid model name';
  }
  if (o.effort !== undefined && !agentEfforts.includes(o.effort)) {
    return 'Invalid effort';
  }
  if (o.resume !== undefined && !isSafeAgentId(o.resume)) {
    return 'Invalid conversation id to resume';
  }
  return undefined;
}

function check(req: AgentSendRequest): string | undefined {
  if (typeof req.prompt !== 'string' || req.prompt.trim() === '' || req.prompt.length > MAX_PROMPT) {
    return `The prompt must be 1-${MAX_PROMPT} characters`;
  }
  return checkOptions(req);
}

/** A timer that does not keep the process alive by itself (main ends with the app; a test run ends too). */
function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return t;
}

/** Runs Claude Code / Codex turns for Freeter's own AI screens (spec E). */
export function createAiAgentRunner({ findProgram, spawn, kill, emit, argsFor, newId, timeoutMs, idleMs }: Deps) {
  const conversations = new Map<string, Conversation>();
  /**
   * Where each CLI was found, kept for DETECT_MS: the PATH search reads disk on the main thread (a network drive can
   * be slow). A missing one is kept for MISS_MS only, so a CLI the user just installed shows soon.
   */
  let found: { at: number; programs: Partial<Record<AgentTool, string>> } | undefined;
  const missedAt: Partial<Record<AgentTool, number>> = {};
  const programOf = (tool: AgentTool): string | undefined => {
    const now = Date.now();
    if (!found || now - found.at > DETECT_MS) {
      found = { at: now, programs: {} };
    }
    if (found.programs[tool] === undefined && now - (missedAt[tool] ?? -Infinity) > MISS_MS) {
      found.programs[tool] = findProgram(tool);
      missedAt[tool] = found.programs[tool] === undefined ? now : undefined;
    }
    return found.programs[tool];
  };
  /** The conversation's live process can take a turn with these options. */
  const reusable = (conv: Conversation, o: AgentWarmOptions) => !!conv.live && !conv.live.gone && keyOf(conv.live.options) === keyOf(o);

  /** No new turn goes to this process. */
  const retire = (conv: Conversation, live: Live) => {
    live.gone = true;
    clearTimeout(live.idle);
    clearTimeout(live.grace);
    if (conv.live === live) {
      conv.live = undefined;
    }
  };

  /** Ends a process on purpose; its later exit reports nothing. */
  const stop = (conv: Conversation, live: Live) => {
    live.stopped = true;
    retire(conv, live);
    if (!live.exited) {
      kill(live.proc);
    }
  };

  /**
   * A turn still ending inside the CLI (Stop, a failed Codex turn) that has not ended after STOP_GRACE_MS: the process
   * ends, and so does the turn of the moment (a held one). Each Stop or held send counts from its own time.
   */
  const armStopGrace = (conv: Conversation, live: Live, message: string) => {
    clearTimeout(live.grace);
    live.grace = later(() => {
      if (!live.gone && live.session.stopping()) {
        live.turn?.end(message);
        stop(conv, live);
      }
    }, STOP_GRACE_MS);
  };

  /** A process with no turn ends after idleMs; each new use starts the time again. */
  const armIdle = (conv: Conversation, live: Live) => {
    clearTimeout(live.idle);
    live.idle = later(() => stop(conv, live), idleMs);
  };

  const startTurn = (id: string, conv: Conversation, live: Live, prompt: string) => {
    let finished = false;
    // Set after the turn exists (its callback ends the turn).
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;
    const turn: Turn = {
      end(error) {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        if (live.turn === turn) {
          live.turn = undefined;
        }
        if (conv.turn === turn) {
          conv.turn = undefined;
        }
        live.prompt = undefined;
        if (error) {
          emit(id, { type: 'error', message: error, ...(conv.sessionId ? { sessionId: conv.sessionId } : {}) });
        }
        // What the CLI said belongs to this turn (and to the warm-up before it): the next turn starts clean.
        live.stderr = '';
        live.note = undefined;
        if (!live.gone) {
          armIdle(conv, live);
        }
      }
    };
    timer = later(() => {
      turn.end('No answer in time; stopped');
      stop(conv, live);
    }, timeoutMs);
    clearTimeout(live.idle);
    live.prompt = prompt;
    live.turn = turn;
    conv.turn = turn;
    const text = live.session.prompt(prompt);
    if (text) {
      live.proc.stdin?.write(text);
    } else {
      live.queued = prompt;
      if (live.session.stopping()) {
        // Held behind a turn still ending inside the CLI (Stop, a failed Codex turn): if it never ends, give up.
        armStopGrace(conv, live, 'The previous answer did not end in time; send your message again');
      }
    }
  };

  const startProcess = (id: string, conv: Conversation, program: string, o: AgentWarmOptions): Live => {
    const proc = spawn(program, argsFor(conv.tool, { sessionId: conv.sessionId, model: o.model || undefined, effort: o.effort }));
    const session = createAgentSession(conv.tool, conv.sessionId);
    const live: Live = { proc, session, stderr: '', program, options: o };
    conv.live = live;
    armIdle(conv, live);
    const stoppedWithoutAnswer = () => live.stderr.trim() || live.note || 'The CLI stopped without an answer';
    const gone = (error: string) => {
      retire(conv, live);
      live.turn?.end(error);
    };
    proc.stdout?.on('data', createLineSplitter(line => {
      if (live.stopped) {
        return;
      }
      const read = session.read(line);
      // Ids printed outside a turn are not kept: a CLI conversation is saved only once a turn ran in it.
      if (live.turn && isSafeAgentId(read.sessionId) && read.sessionId !== conv.sessionId) {
        conv.sessionId = read.sessionId;
        emit(id, { type: 'session', sessionId: read.sessionId });
      }
      live.note = read.note ?? live.note;
      if (read.reply) {
        proc.stdin?.write(read.reply);
      }
      if (read.sessionLost) {
        // The conversation to continue is gone: a new one starts, and a running turn's prompt goes to it.
        conv.sessionId = undefined;
        emit(id, { type: 'notice', message: live.turn ? NEW_CONVERSATION : NEW_CONVERSATION_NEXT, sessionLost: true });
        const prompt = live.turn ? live.prompt : undefined;
        live.turn?.end();
        stop(conv, live);
        if (prompt !== undefined) {
          try {
            startTurn(id, conv, startProcess(id, conv, live.program, live.options), prompt);
          } catch (err) {
            // In a stream listener a throw would be an uncaught exception in main; the page gets the reason.
            emit(id, { type: 'error', message: err instanceof Error ? err.message : String(err) });
          }
        }
        return;
      }
      let ending = false;
      for (const event of read.events) {
        const turn = live.turn;
        if (!turn) {
          break; // no turn (start-up output, or cancelled, timed out, already answered): dropped
        }
        const withId = event.type === 'done' || event.type === 'error';
        emit(id, withId && !event.sessionId && conv.sessionId ? { ...event, sessionId: conv.sessionId } : event);
        ending ||= withId;
      }
      // The turn is over (answered or failed), after the whole line: Claude follows an error with its done (session id).
      // A later 'close' reports nothing more.
      if (ending) {
        live.turn?.end();
      }
      if (read.ready && live.queued !== undefined) {
        const queued = session.prompt(live.queued);
        live.queued = undefined;
        if (queued) {
          proc.stdin?.write(queued);
        }
      }
      if (read.end) {
        stop(conv, live);
      }
    }, () => {
      live.turn?.end('The CLI printed a line too long to read');
      stop(conv, live);
    }));
    proc.stderr?.on('data', (d: Buffer | string) => {
      // Keep the end: the CLI's own message (e.g. "not logged in") is what the user needs.
      live.stderr = (live.stderr + String(d)).slice(-2000);
    });
    proc.on('error', err => {
      found = undefined; // the found path may be gone (uninstalled, moved): look again
      gone(err.message);
    });
    // 'close' comes after the last stdout data; 'exit' can come before it, so a running turn waits a moment.
    // No kill here: on Windows taskkill /T finds no tree under a process that has exited. Its `freeter mcp`
    // child ends by itself when its stdin closes (after its open calls, at most the request time limit).
    proc.on('exit', () => {
      live.exited = true;
      retire(conv, live);
      if (live.turn) {
        const turn = live.turn;
        live.grace = later(() => turn.end(stoppedWithoutAnswer()), EXIT_GRACE_MS);
      }
    });
    proc.on('close', () => {
      clearTimeout(live.grace);
      gone(stoppedWithoutAnswer());
    });
    // A CLI that exits before reading the prompt makes the write fail (EPIPE); 'close' reports the exit.
    proc.stdin?.on('error', () => undefined);
    const firstLines = session.start();
    if (firstLines) {
      proc.stdin?.write(firstLines);
    }
    return live;
  };

  /** The conversation's CLI process, started (or restarted for other options) when needed. */
  const liveFor = (id: string, conv: Conversation, program: string, o: AgentWarmOptions): Live => {
    const live = conv.live;
    if (live && reusable(conv, o)) {
      // Used again (e.g. warm on input focus; callers start no turn while one runs): its idle time starts again.
      armIdle(conv, live);
      return live;
    }
    if (conv.live) {
      stop(conv, conv.live);
    }
    return startProcess(id, conv, program, o);
  };

  const prepare = (conversationId: string | null, o: AgentWarmOptions):
    { ok: false; message: string } | { ok: true; id: string; conv: Conversation; program: string } => {
    const conv = conversationId === null ? { tool: o.tool, sessionId: o.resume } : conversations.get(conversationId);
    if (!conv) {
      return { ok: false, message: 'Unknown conversation' };
    }
    if (conv.tool !== o.tool) {
      return { ok: false, message: 'A conversation stays with the tool it started with' };
    }
    // A live process for these options is used again: no PATH search (it reads disk on the main thread).
    const program = reusable(conv, o) ? '' : programOf(o.tool);
    if (program === undefined) {
      return { ok: false, message: `${o.tool} is not installed (not found on PATH)` };
    }
    const id = conversationId ?? newId();
    conversations.set(id, conv);
    return { ok: true, id, conv, program };
  };

  /** Starts a process (spawn can throw); a new conversation that could not start is not kept. */
  const start = (conversationId: string | null, id: string, run: () => void): { ok: false; message: string } | undefined => {
    try {
      run();
      return undefined;
    } catch (err) {
      if (conversationId === null) {
        conversations.delete(id);
      }
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  };

  const close = (conv: Conversation) => {
    conv.turn?.end();
    if (conv.live) {
      stop(conv, conv.live);
    }
  };

  return {
    detect(): Record<AgentTool, boolean> {
      return { claude: programOf('claude') !== undefined, codex: programOf('codex') !== undefined };
    },

    /**
     * Starts the conversation's CLI before the first prompt (a CLI takes seconds to start).
     * conversationId null starts a new conversation.
     */
    warm(conversationId: string | null, o: AgentWarmOptions): AgentSendResult {
      const invalid = checkOptions(o);
      if (invalid) {
        return { ok: false, message: invalid };
      }
      const p = prepare(conversationId, o);
      if (!p.ok) {
        return p;
      }
      if (!p.conv.turn) {
        const failed = start(conversationId, p.id, () => liveFor(p.id, p.conv, p.program, o));
        if (failed) {
          return failed;
        }
      }
      return { ok: true, conversationId: p.id };
    },

    send(conversationId: string | null, req: AgentSendRequest): AgentSendResult {
      const invalid = check(req);
      if (invalid) {
        return { ok: false, message: invalid };
      }
      if (conversationId !== null && conversations.get(conversationId)?.turn) {
        return { ok: false, message: 'The previous turn is still running' };
      }
      const p = prepare(conversationId, req);
      if (!p.ok) {
        return p;
      }
      // The process keeps how it was started, not the prompt (up to MAX_PROMPT).
      const { prompt: _prompt, ...options } = req;
      const failed = start(conversationId, p.id, () => startTurn(p.id, p.conv, liveFor(p.id, p.conv, p.program, options), req.prompt));
      return failed ?? { ok: true, conversationId: p.id };
    },

    cancel(conversationId: string): void {
      const conv = conversations.get(conversationId);
      if (!conv?.turn) {
        return;
      }
      const live = conv.live;
      // A prompt still held (Codex: behind a stopped turn) never reaches the CLI.
      const held = live?.queued !== undefined;
      if (live) {
        live.queued = undefined;
      }
      const interrupt = held ? undefined : live?.session.interrupt();
      conv.turn.end('Cancelled');
      if (live && interrupt) {
        live.proc.stdin?.write(interrupt);
        armStopGrace(conv, live, 'Stopping took too long; send your message again');
      } else if (live && !held) {
        // Not stoppable inside the CLI now (a Freeter tool call runs, or the turn has not started yet):
        // the process ends and the next turn resumes the conversation.
        stop(conv, live);
      }
    },

    /** Forgets the conversation and ends its CLI (New Conversation). */
    end(conversationId: string): void {
      const conv = conversations.get(conversationId);
      if (conv) {
        close(conv);
        conversations.delete(conversationId);
      }
    },

    /** App quit or page reload: the page cannot use these conversations again. */
    stopAll(): void {
      for (const conv of conversations.values()) {
        close(conv);
      }
      conversations.clear();
    }
  };
}

export type AiAgentRunner = ReturnType<typeof createAiAgentRunner>;
