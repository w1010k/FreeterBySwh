/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 *
 * A classic 4-function calculator implemented as a pure state machine (no eval).
 */

export type Op = '+' | '-' | '*' | '/';

export interface CalcState {
  /** The string currently shown on the display. */
  display: string;
  /** The accumulated left-hand value (null before the first operator). */
  acc: number | null;
  /** The pending operator awaiting a right-hand operand. */
  op: Op | null;
  /** When true, the next digit starts a fresh operand (replaces the display). */
  waiting: boolean;
  /** Set after a divide-by-zero (or other non-finite) result. */
  error: boolean;
}

export type CalcAction =
  | { type: 'digit'; value: string }
  | { type: 'dot' }
  | { type: 'op'; value: Op }
  | { type: 'equals' }
  | { type: 'clear' }
  | { type: 'negate' }
  | { type: 'percent' }
  | { type: 'backspace' };

export const initialCalcState: CalcState = { display: '0', acc: null, op: null, waiting: false, error: false };

const MAX_LEN = 15;

function apply(a: number, b: number, op: Op): number {
  if (op === '+') {
    return a + b;
  }
  if (op === '-') {
    return a - b;
  }
  if (op === '*') {
    return a * b;
  }
  return a / b;
}

// Trim float noise (e.g. 0.1 + 0.2) and overly-long results to a readable string.
function numToDisplay(n: number): string {
  if (!Number.isFinite(n)) {
    return 'Error';
  }
  let s = String(n);
  if (s.replace('-', '').replace('.', '').length > MAX_LEN) {
    s = n.toPrecision(MAX_LEN - 2);
    // drop trailing zeros / dangling dot from toPrecision
    if (s.indexOf('.') > -1 && s.indexOf('e') < 0) {
      s = s.replace(/\.?0+$/, '');
    }
  }
  return s;
}

export function calcReducer(state: CalcState, action: CalcAction): CalcState {
  if (action.type === 'clear') {
    return initialCalcState;
  }
  if (state.error) {
    // Any key other than Clear (handled above) after an error: ignore.
    return state;
  }

  switch (action.type) {
    case 'digit': {
      if (state.waiting || state.display === '0') {
        return { ...state, display: action.value, waiting: false };
      }
      if (state.display.replace('-', '').replace('.', '').length >= MAX_LEN) {
        return state;
      }
      return { ...state, display: state.display + action.value };
    }
    case 'dot': {
      if (state.waiting) {
        return { ...state, display: '0.', waiting: false };
      }
      if (state.display.indexOf('.') > -1) {
        return state;
      }
      return { ...state, display: state.display + '.' };
    }
    case 'backspace': {
      if (state.waiting) {
        return state;
      }
      const next = state.display.length > 1 ? state.display.slice(0, -1) : '0';
      return { ...state, display: next === '-' || next === '' ? '0' : next };
    }
    case 'negate': {
      if (state.display === '0' || state.display === 'Error') {
        return state;
      }
      return { ...state, display: state.display.startsWith('-') ? state.display.slice(1) : '-' + state.display };
    }
    case 'percent': {
      const v = parseFloat(state.display) / 100;
      return { ...state, display: numToDisplay(v), waiting: false };
    }
    case 'op': {
      const current = parseFloat(state.display);
      // Chain: if there's a pending op and we just typed a number, fold it in.
      if (state.op !== null && !state.waiting && state.acc !== null) {
        const result = apply(state.acc, current, state.op);
        if (!Number.isFinite(result)) {
          return { ...initialCalcState, display: 'Error', error: true };
        }
        return { display: numToDisplay(result), acc: result, op: action.value, waiting: true, error: false };
      }
      return { ...state, acc: current, op: action.value, waiting: true };
    }
    case 'equals': {
      if (state.op === null || state.acc === null) {
        return state;
      }
      const current = parseFloat(state.display);
      const result = apply(state.acc, current, state.op);
      if (!Number.isFinite(result)) {
        return { ...initialCalcState, display: 'Error', error: true };
      }
      return { display: numToDisplay(result), acc: null, op: null, waiting: true, error: false };
    }
  }
  return state;
}
