/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { agentSessionId, parseAgentLine } from '@/infra/aiAgent/agentEvents';
import { AgentEffort, AgentEvent, AgentSendRequest, AgentTool, agentTools } from '@common/ai/agent';
import { createLineSplitter } from '@common/ai/protocol';

/** The part of a child process the runner uses. */
export interface AgentProcess {
  pid?: number;
  stdin: { write(s: string): unknown; end(): unknown } | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'exit', fn: (code: number | null) => void): unknown;
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
}

export type AgentSendResult = { ok: true; conversationId: string } | { ok: false; message: string };

interface Conversation {
  tool: AgentTool;
  sessionId?: string;
  running?: { proc: AgentProcess; finish(error?: string): void };
}

const MAX_PROMPT = 100000;
// Model names go on a command line (through cmd.exe for .cmd CLIs): letters, digits and ._:-[] only.
const safeModel = /^[A-Za-z0-9._:[\]-]{1,100}$/;
const efforts: readonly AgentEffort[] = ['low', 'medium', 'high'];

function check(req: AgentSendRequest): string | undefined {
  if (!agentTools.includes(req.tool)) {
    return 'Unknown tool';
  }
  if (typeof req.prompt !== 'string' || req.prompt.trim() === '' || req.prompt.length > MAX_PROMPT) {
    return `The prompt must be 1-${MAX_PROMPT} characters`;
  }
  if (req.model !== undefined && req.model !== '' && !safeModel.test(req.model)) {
    return 'Invalid model name';
  }
  if (req.effort !== undefined && !efforts.includes(req.effort)) {
    return 'Invalid effort';
  }
  return undefined;
}

/** Runs Claude Code / Codex turns for Freeter's own AI screens (spec E). */
export function createAiAgentRunner({ findProgram, spawn, kill, emit, argsFor, newId, timeoutMs }: Deps) {
  const conversations = new Map<string, Conversation>();

  const start = (id: string, conv: Conversation, program: string, req: AgentSendRequest) => {
    const proc = spawn(program, argsFor(conv.tool, { sessionId: conv.sessionId, model: req.model || undefined, effort: req.effort }));
    let finished = false;
    let done = false;
    let stderr = '';
    const finish = (error?: string) => {
      if (finished) {
        return;
      }
      finished = true;
      conv.running = undefined;
      if (error) {
        emit(id, { type: 'error', message: error });
      }
    };
    const timer = setTimeout(() => {
      finish('No answer in time; stopped');
      kill(proc);
    }, timeoutMs);
    const end = (error?: string) => {
      clearTimeout(timer);
      finish(error);
    };
    conv.running = { proc, finish: end };

    proc.stdout?.on('data', createLineSplitter(line => {
      conv.sessionId = agentSessionId(conv.tool, line) ?? conv.sessionId;
      for (const event of parseAgentLine(conv.tool, line)) {
        done ||= event.type === 'done';
        emit(id, event.type === 'done' ? { ...event, sessionId: event.sessionId ?? conv.sessionId } : event);
      }
    }, () => {
      end('The CLI printed a line too long to read');
      kill(proc);
    }));
    proc.stderr?.on('data', (d: Buffer | string) => {
      // Keep the end: the CLI's own message (e.g. "not logged in") is what the user needs.
      stderr = (stderr + String(d)).slice(-2000);
    });
    proc.on('error', err => end(err.message));
    proc.on('exit', () => end(done ? undefined : (stderr.trim() || 'The CLI stopped without an answer')));
    proc.stdin?.write(req.prompt);
    proc.stdin?.end();
  };

  return {
    detect(): Record<AgentTool, boolean> {
      return { claude: findProgram('claude') !== undefined, codex: findProgram('codex') !== undefined };
    },

    send(conversationId: string | null, req: AgentSendRequest): AgentSendResult {
      const invalid = check(req);
      if (invalid) {
        return { ok: false, message: invalid };
      }
      const conv = conversationId === null ? { tool: req.tool } : conversations.get(conversationId);
      if (!conv) {
        return { ok: false, message: 'Unknown conversation' };
      }
      if (conv.tool !== req.tool) {
        return { ok: false, message: 'A conversation stays with the tool it started with' };
      }
      if (conv.running) {
        return { ok: false, message: 'The previous turn is still running' };
      }
      const program = findProgram(req.tool);
      if (!program) {
        return { ok: false, message: `${req.tool} is not installed (not found on PATH)` };
      }
      const id = conversationId ?? newId();
      conversations.set(id, conv);
      start(id, conv, program, req);
      return { ok: true, conversationId: id };
    },

    cancel(conversationId: string): void {
      const running = conversations.get(conversationId)?.running;
      if (running) {
        running.finish('Cancelled');
        kill(running.proc);
      }
    },

    stopAll(): void {
      for (const conv of conversations.values()) {
        if (conv.running) {
          const { proc, finish } = conv.running;
          finish();
          kill(proc);
        }
      }
    }
  };
}

export type AiAgentRunner = ReturnType<typeof createAiAgentRunner>;
