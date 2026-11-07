/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AI_MAX_LINE_BYTES, createLineSplitter, encodeLine, toRpcResponse } from '@common/ai/protocol';

describe('createLineSplitter', () => {
  it('emits each line of one chunk and joins split chunks', () => {
    const lines: string[] = [];
    const push = createLineSplitter(l => lines.push(l), jest.fn());
    push('{"a":1}\n{"b"');
    push(':2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('accepts Buffer chunks, even when a multi-byte character is split between them', () => {
    const lines: string[] = [];
    const push = createLineSplitter(l => lines.push(l), jest.fn());
    const bytes = Buffer.from('한\n');
    push(bytes.subarray(0, 1));
    push(bytes.subarray(1));
    expect(lines).toEqual(['한']);
  });

  it('skips empty lines and strips \\r', () => {
    const lines: string[] = [];
    const push = createLineSplitter(l => lines.push(l), jest.fn());
    push('x\r\n\n');
    expect(lines).toEqual(['x']);
  });

  it('calls onOverflow once when a pending line exceeds AI_MAX_LINE_BYTES, then ignores input', () => {
    const lines: string[] = [];
    const onOverflow = jest.fn();
    const push = createLineSplitter(l => lines.push(l), onOverflow);
    push('a'.repeat(AI_MAX_LINE_BYTES + 1));
    push('b\n');
    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
  });
});

describe('encodeLine', () => {
  it('serializes to one JSON line', () => {
    expect(encodeLine({ a: 'x\ny' })).toBe('{"a":"x\\ny"}\n');
  });
});

describe('toRpcResponse', () => {
  it('maps success to result', () => {
    expect(toRpcResponse(1, { ok: true, value: 42 })).toEqual({ jsonrpc: '2.0', id: 1, result: 42 });
  });

  it('maps failure to error -32000 with data.code', () => {
    expect(toRpcResponse(3, { ok: false, code: 'denied', message: 'm' }))
      .toEqual({ jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'm', data: { code: 'denied' } } });
  });
});
