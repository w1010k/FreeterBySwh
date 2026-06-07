/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { calcReducer, initialCalcState, CalcState, CalcAction, Op } from '@/widgets/calculator/calc';

const digit = (v: string): CalcAction => ({ type: 'digit', value: v });
const op = (v: Op): CalcAction => ({ type: 'op', value: v });
const equals: CalcAction = { type: 'equals' };

function run(actions: CalcAction[], state: CalcState = initialCalcState): CalcState {
  return actions.reduce(calcReducer, state);
}

describe('calcReducer', () => {
  it('builds a multi-digit number, replacing the leading zero', () => {
    expect(run([digit('1'), digit('2'), digit('3')]).display).toBe('123');
  });

  it('does the four operations', () => {
    expect(run([digit('2'), op('+'), digit('3'), equals]).display).toBe('5');
    expect(run([digit('9'), op('-'), digit('4'), equals]).display).toBe('5');
    expect(run([digit('6'), op('*'), digit('7'), equals]).display).toBe('42');
    expect(run([digit('8'), op('/'), digit('2'), equals]).display).toBe('4');
  });

  it('folds a chained operator left-to-right (2 + 3 * 4 → 20)', () => {
    expect(run([digit('2'), op('+'), digit('3'), op('*'), digit('4'), equals]).display).toBe('20');
  });

  it('handles decimals and blocks a second dot', () => {
    expect(run([digit('1'), { type: 'dot' }, digit('5'), op('+'), digit('2'), equals]).display).toBe('3.5');
    expect(run([digit('1'), { type: 'dot' }, { type: 'dot' }, digit('5')]).display).toBe('1.5');
  });

  it('shows Error on divide-by-zero and only Clear recovers', () => {
    const errored = run([digit('5'), op('/'), digit('0'), equals]);
    expect(errored.display).toBe('Error');
    expect(errored.error).toBe(true);
    expect(calcReducer(errored, digit('7')).display).toBe('Error'); // ignored
    expect(calcReducer(errored, { type: 'clear' })).toEqual(initialCalcState);
  });

  it('clears, negates, percents and backspaces', () => {
    expect(run([digit('1'), digit('2'), { type: 'clear' }])).toEqual(initialCalcState);
    expect(run([digit('5'), { type: 'negate' }]).display).toBe('-5');
    expect(run([digit('5'), { type: 'negate' }, { type: 'negate' }]).display).toBe('5');
    expect(run([digit('5'), digit('0'), { type: 'percent' }]).display).toBe('0.5');
    expect(run([digit('1'), digit('2'), digit('3'), { type: 'backspace' }]).display).toBe('12');
    expect(run([digit('5'), { type: 'backspace' }]).display).toBe('0');
  });
});
