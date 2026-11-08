/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEvent } from '@common/ai/agent';

export type Json = Record<string, unknown>;

/** One output line as an object; undefined for a log line (not JSON). */
export function parse(line: string): Json | undefined {
  try {
    const v: unknown = JSON.parse(line);
    return typeof v === 'object' && v !== null ? v as Json : undefined;
  } catch {
    // Not JSON (a log line).
    return undefined;
  }
}

export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
export const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v as Json : undefined);
const contentOf = (o: Json): Json[] => {
  const content = obj(o.message)?.content;
  return Array.isArray(content) ? content.filter((c): c is Json => typeof c === 'object' && c !== null) : [];
};

/** Claude Code `--output-format stream-json --verbose --include-partial-messages`. */
function parseClaude(o: Json): AgentEvent[] {
  switch (o.type) {
    case 'assistant':
      return contentOf(o).flatMap((c): AgentEvent[] => {
        // Usually streamed before as deltas; agentSession.ts drops it then.
        if (c.type === 'text' && str(c.text)) {
          return [{ type: 'text', text: str(c.text) as string }];
        }
        if (c.type === 'tool_use') {
          return [{ type: 'tool', name: (str(c.name) ?? '').replace(/^mcp__freeter__/, ''), phase: 'start' }];
        }
        return [];
      });
    case 'stream_event': {
      const ev = obj(o.event);
      if (ev?.type === 'content_block_start' && obj(ev.content_block)?.type === 'text') {
        return [{ type: 'text', text: '' }];
      }
      const delta = ev?.type === 'content_block_delta' ? obj(ev.delta) : undefined;
      return delta?.type === 'text_delta' && str(delta.text) ? [{ type: 'textDelta', text: str(delta.text) as string }] : [];
    }
    case 'user':
      return contentOf(o).filter(c => c.type === 'tool_result')
        .map((c): AgentEvent => ({ type: 'tool', name: '', phase: 'end', ok: c.is_error !== true }));
    case 'result': {
      const done: AgentEvent = { type: 'done', sessionId: str(o.session_id), costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined };
      const errors = Array.isArray(o.errors) ? o.errors.filter((e): e is string => typeof e === 'string') : [];
      const message = str(o.result) || (errors.length > 0 ? errors.join('; ') : `Claude Code failed (${String(o.subtype)})`);
      return o.is_error === true ? [{ type: 'error', message }, done] : [done];
    }
    default:
      return [];
  }
}

/** One line of Claude Code output (parsed once: it streams a line per token). */
export interface ClaudeLine {
  events: AgentEvent[];
  sessionId?: string;
  /** A complete assistant message (its text events repeat what was streamed, if anything was). */
  message?: true;
  /** `--resume` named a session Claude Code does not have (verified with Claude Code 2.1.319). */
  sessionNotFound?: true;
  /** Output of a running turn (a model message or stream event), so the turn has started. */
  turnOutput?: true;
}

export function parseClaudeLine(line: string): ClaudeLine {
  const o = parse(line);
  if (!o) {
    return { events: [] };
  }
  const sessionId = str(o.session_id);
  return {
    events: parseClaude(o),
    ...(sessionId ? { sessionId } : {}),
    ...(o.type === 'assistant' ? { message: true as const } : {}),
    ...(o.type === 'assistant' || o.type === 'stream_event' ? { turnOutput: true as const } : {}),
    ...(o.type === 'result' && o.is_error === true && Array.isArray(o.errors)
      && o.errors.some(e => typeof e === 'string' && e.startsWith('No conversation found')) ? { sessionNotFound: true as const } : {}),
  };
}
