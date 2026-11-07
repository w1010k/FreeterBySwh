/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEvent, AgentTool } from '@common/ai/agent';

type Json = Record<string, unknown>;

function parse(line: string): Json | undefined {
  try {
    const v: unknown = JSON.parse(line);
    return typeof v === 'object' && v !== null ? v as Json : undefined;
  } catch {
    // Codex prints a few plain lines (e.g. "Reading prompt from stdin...").
    return undefined;
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const contentOf = (o: Json): Json[] => {
  const content = (o.message as Json | undefined)?.content;
  return Array.isArray(content) ? content.filter((c): c is Json => typeof c === 'object' && c !== null) : [];
};

/** Claude Code `--output-format stream-json --verbose`. */
function parseClaude(o: Json): AgentEvent[] {
  switch (o.type) {
    case 'assistant':
      return contentOf(o).flatMap((c): AgentEvent[] => {
        if (c.type === 'text' && str(c.text)) {
          return [{ type: 'text', text: str(c.text) as string }];
        }
        if (c.type === 'tool_use') {
          return [{ type: 'tool', name: (str(c.name) ?? '').replace(/^mcp__freeter__/, ''), phase: 'start' }];
        }
        return [];
      });
    case 'user':
      return contentOf(o).filter(c => c.type === 'tool_result')
        .map((c): AgentEvent => ({ type: 'tool', name: '', phase: 'end', ok: c.is_error !== true }));
    case 'result': {
      const done: AgentEvent = { type: 'done', sessionId: str(o.session_id), costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined };
      return o.is_error === true ? [{ type: 'error', message: str(o.result) ?? `Claude Code failed (${String(o.subtype)})` }, done] : [done];
    }
    default:
      return [];
  }
}

/** Codex `exec --json`. */
function parseCodex(o: Json): AgentEvent[] {
  const item = o.item as Json | undefined;
  switch (o.type) {
    case 'item.started':
      return item?.type === 'mcp_tool_call' ? [{ type: 'tool', name: str(item.tool) ?? '', phase: 'start' }] : [];
    case 'item.completed':
      if (item?.type === 'agent_message' && str(item.text)) {
        return [{ type: 'text', text: str(item.text) as string }];
      }
      return item?.type === 'mcp_tool_call' ? [{ type: 'tool', name: str(item.tool) ?? '', phase: 'end', ok: item.status !== 'failed' }] : [];
    case 'turn.completed':
      return [{ type: 'done' }];
    case 'turn.failed':
      return [{ type: 'error', message: str((o.error as Json | undefined)?.message) ?? 'Codex failed' }];
    case 'error':
      return [{ type: 'error', message: str(o.message) ?? 'Codex failed' }];
    default:
      return [];
  }
}

export function parseAgentLine(tool: AgentTool, line: string): AgentEvent[] {
  const o = parse(line);
  if (!o) {
    return [];
  }
  return tool === 'claude' ? parseClaude(o) : parseCodex(o);
}

/** The id to resume the conversation with, when this line carries it. */
export function agentSessionId(tool: AgentTool, line: string): string | undefined {
  const o = parse(line);
  if (!o) {
    return undefined;
  }
  return tool === 'claude' ? str(o.session_id) : (o.type === 'thread.started' ? str(o.thread_id) : undefined);
}
