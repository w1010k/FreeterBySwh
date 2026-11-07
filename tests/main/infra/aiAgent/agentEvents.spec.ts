/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { agentSessionId, parseAgentLine } from '@/infra/aiAgent/agentEvents';

const j = (o: object) => JSON.stringify(o);

describe('parseAgentLine(claude)', () => {
  it('maps assistant text and tool use, and ignores system and rate-limit lines', () => {
    expect(parseAgentLine('claude', j({ type: 'system', subtype: 'init', session_id: 's' }))).toEqual([]);
    expect(parseAgentLine('claude', j({ type: 'rate_limit_event' }))).toEqual([]);
    expect(parseAgentLine('claude', j({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'mcp__freeter__app_describe' }] }
    }))).toEqual([{ type: 'text', text: 'Hi' }, { type: 'tool', name: 'app_describe', phase: 'start' }]);
  });

  it('maps tool results to tool end', () => {
    expect(parseAgentLine('claude', j({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } })))
      .toEqual([{ type: 'tool', name: '', phase: 'end', ok: false }]);
  });

  it('maps the result line to done or error', () => {
    expect(parseAgentLine('claude', j({ type: 'result', subtype: 'success', is_error: false, session_id: 's1', total_cost_usd: 0.01, result: 'Hi' })))
      .toEqual([{ type: 'done', sessionId: 's1', costUsd: 0.01 }]);
    expect(parseAgentLine('claude', j({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's1', result: 'boom' })))
      .toEqual([{ type: 'error', message: 'boom' }, { type: 'done', sessionId: 's1', costUsd: undefined }]);
  });
});

describe('parseAgentLine(codex)', () => {
  it('maps thread start, messages and MCP tool calls', () => {
    expect(parseAgentLine('codex', j({ type: 'thread.started', thread_id: 't1' }))).toEqual([]);
    expect(parseAgentLine('codex', j({ type: 'turn.completed', usage: {} }))).toEqual([{ type: 'done' }]);
    expect(parseAgentLine('codex', j({ type: 'item.completed', item: { type: 'agent_message', text: 'Hi' } }))).toEqual([{ type: 'text', text: 'Hi' }]);
    expect(parseAgentLine('codex', j({ type: 'item.started', item: { type: 'mcp_tool_call', tool: 'workflow_create' } })))
      .toEqual([{ type: 'tool', name: 'workflow_create', phase: 'start' }]);
    expect(parseAgentLine('codex', j({ type: 'item.completed', item: { type: 'mcp_tool_call', tool: 'workflow_create', status: 'failed' } })))
      .toEqual([{ type: 'tool', name: 'workflow_create', phase: 'end', ok: false }]);
  });

  it('maps turn failures and errors', () => {
    expect(parseAgentLine('codex', j({ type: 'turn.failed', error: { message: 'quota' } }))).toEqual([{ type: 'error', message: 'quota' }]);
    expect(parseAgentLine('codex', j({ type: 'error', message: 'bad' }))).toEqual([{ type: 'error', message: 'bad' }]);
  });

  it('ignores lines that are not JSON', () => {
    expect(agentSessionId('codex', 'x')).toBeUndefined();
    expect(parseAgentLine('codex', 'Reading prompt from stdin...')).toEqual([]);
  });
});

describe('agentSessionId', () => {
  it('reads the Claude session id and the Codex thread id', () => {
    expect(agentSessionId('claude', j({ type: 'system', subtype: 'init', session_id: 's1' }))).toBe('s1');
    expect(agentSessionId('codex', j({ type: 'thread.started', thread_id: 't1' }))).toBe('t1');
    expect(agentSessionId('codex', j({ type: 'turn.completed' }))).toBeUndefined();
  });
});
