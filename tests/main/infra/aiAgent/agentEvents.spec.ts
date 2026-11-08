/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { parseClaudeLine } from '@/infra/aiAgent/agentEvents';

const j = (o: object) => JSON.stringify(o);
const eventsOf = (line: string) => parseClaudeLine(line).events;

describe('parseClaudeLine', () => {
  it('maps text and tool use of assistant messages, and ignores system and rate-limit lines', () => {
    expect(eventsOf(j({ type: 'system', subtype: 'init', session_id: 's' }))).toEqual([]);
    expect(eventsOf(j({ type: 'rate_limit_event' }))).toEqual([]);
    expect(eventsOf(j({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'mcp__freeter__app_describe' }] }
    }))).toEqual([{ type: 'text', text: 'Hi' }, { type: 'tool', name: 'app_describe', phase: 'start' }]);
  });

  it('maps streamed text: a text block start opens a paragraph, text deltas extend it; other deltas are ignored', () => {
    const ev = (event: object) => eventsOf(j({ type: 'stream_event', event }));
    expect(ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })).toEqual([{ type: 'text', text: '' }]);
    expect(ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } })).toEqual([{ type: 'textDelta', text: 'Hi' }]);
    expect(ev({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', name: 'x' } })).toEqual([]);
    expect(ev({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{' } })).toEqual([]);
    expect(ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } })).toEqual([]);
  });

  it('maps tool results to tool end', () => {
    expect(eventsOf(j({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } })))
      .toEqual([{ type: 'tool', name: '', phase: 'end', ok: false }]);
  });

  it('maps the result line to done or error', () => {
    expect(eventsOf(j({ type: 'result', subtype: 'success', is_error: false, session_id: 's1', total_cost_usd: 0.01, result: 'Hi' })))
      .toEqual([{ type: 'done', sessionId: 's1', costUsd: 0.01 }]);
    expect(eventsOf(j({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's1', result: 'boom' })))
      .toEqual([{ type: 'error', message: 'boom' }, { type: 'done', sessionId: 's1', costUsd: undefined }]);
    expect(eventsOf(j({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's1', result: '', errors: ['quota'] }))[0])
      .toEqual({ type: 'error', message: 'quota' });
  });
});

describe('parseClaudeLine: session id', () => {
  it('reads the session id, and ignores lines that are not JSON', () => {
    expect(parseClaudeLine(j({ type: 'system', subtype: 'init', session_id: 's1' })).sessionId).toBe('s1');
    expect(parseClaudeLine('not json')).toEqual({ events: [] });
  });
});
