/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createAgentEventCoalescer } from '@/application/ai/agentEventCoalescer';
import { AgentEvent } from '@common/ai/agent';

function setup() {
  const sent: [string, AgentEvent][] = [];
  const emit = createAgentEventCoalescer((id, e) => sent.push([id, e]), 60);
  return { sent, emit };
}

describe('createAgentEventCoalescer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the first piece of text at once and the next ones together, once per window', () => {
    const { sent, emit } = setup();
    emit('c1', { type: 'textDelta', text: 'He' });
    expect(sent).toEqual([['c1', { type: 'textDelta', text: 'He' }]]);
    emit('c1', { type: 'textDelta', text: 'l' });
    emit('c1', { type: 'textDelta', text: 'lo' });
    expect(sent).toHaveLength(1);
    jest.advanceTimersByTime(60);
    expect(sent).toEqual([['c1', { type: 'textDelta', text: 'He' }], ['c1', { type: 'textDelta', text: 'llo' }]]);
  });

  it('sends the held text before any other event of that conversation (order kept)', () => {
    const { sent, emit } = setup();
    emit('c1', { type: 'textDelta', text: 'a' });
    emit('c1', { type: 'textDelta', text: 'b' });
    emit('c1', { type: 'done', sessionId: 's1' });
    expect(sent).toEqual([
      ['c1', { type: 'textDelta', text: 'a' }], ['c1', { type: 'textDelta', text: 'b' }], ['c1', { type: 'done', sessionId: 's1' }],
    ]);
    jest.advanceTimersByTime(60);
    expect(sent).toHaveLength(3);
  });

  it('keeps conversations apart', () => {
    const { sent, emit } = setup();
    emit('c1', { type: 'textDelta', text: 'a' });
    emit('c2', { type: 'textDelta', text: 'x' });
    emit('c1', { type: 'textDelta', text: 'b' });
    emit('c2', { type: 'error', message: 'boom' });
    expect(sent).toEqual([['c1', { type: 'textDelta', text: 'a' }], ['c2', { type: 'textDelta', text: 'x' }], ['c2', { type: 'error', message: 'boom' }]]);
    jest.advanceTimersByTime(60);
    expect(sent[sent.length - 1]).toEqual(['c1', { type: 'textDelta', text: 'b' }]);
  });

  it('sends a piece at once again after a quiet window', () => {
    const { sent, emit } = setup();
    emit('c1', { type: 'textDelta', text: 'a' });
    jest.advanceTimersByTime(100);
    emit('c1', { type: 'textDelta', text: 'b' });
    expect(sent).toEqual([['c1', { type: 'textDelta', text: 'a' }], ['c1', { type: 'textDelta', text: 'b' }]]);
  });

  it('leaves no timer behind once the held text is sent', () => {
    const { emit } = setup();
    emit('c1', { type: 'textDelta', text: 'a' });
    emit('c1', { type: 'textDelta', text: 'b' });
    emit('c1', { type: 'done' });
    expect(jest.getTimerCount()).toBe(0);
  });
});
