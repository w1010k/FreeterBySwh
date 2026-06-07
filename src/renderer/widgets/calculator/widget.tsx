/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { calcReducer, initialCalcState, CalcAction, Op } from './calc';
import styles from './widget.module.scss';
import clsx from 'clsx';
import { KeyboardEvent, useReducer } from 'react';

interface Btn {
  label: string;
  action: CalcAction;
  kind?: 'op' | 'fn' | 'eq';
  wide?: boolean;
}

const ops: Record<string, Op> = { '+': '+', '-': '-', '*': '*', '/': '/' };

const buttons: Btn[] = [
  { label: 'C', action: { type: 'clear' }, kind: 'fn' },
  { label: '±', action: { type: 'negate' }, kind: 'fn' },
  { label: '%', action: { type: 'percent' }, kind: 'fn' },
  { label: '÷', action: { type: 'op', value: '/' }, kind: 'op' },
  { label: '7', action: { type: 'digit', value: '7' } },
  { label: '8', action: { type: 'digit', value: '8' } },
  { label: '9', action: { type: 'digit', value: '9' } },
  { label: '×', action: { type: 'op', value: '*' }, kind: 'op' },
  { label: '4', action: { type: 'digit', value: '4' } },
  { label: '5', action: { type: 'digit', value: '5' } },
  { label: '6', action: { type: 'digit', value: '6' } },
  { label: '−', action: { type: 'op', value: '-' }, kind: 'op' },
  { label: '1', action: { type: 'digit', value: '1' } },
  { label: '2', action: { type: 'digit', value: '2' } },
  { label: '3', action: { type: 'digit', value: '3' } },
  { label: '+', action: { type: 'op', value: '+' }, kind: 'op' },
  { label: '0', action: { type: 'digit', value: '0' }, wide: true },
  { label: '.', action: { type: 'dot' } },
  { label: '=', action: { type: 'equals' }, kind: 'eq' },
];

function keyToAction(key: string): CalcAction | null {
  if (key >= '0' && key <= '9') {
    return { type: 'digit', value: key };
  }
  if (key === '.') {
    return { type: 'dot' };
  }
  if (key in ops) {
    return { type: 'op', value: ops[key] };
  }
  if (key === 'Enter' || key === '=') {
    return { type: 'equals' };
  }
  if (key === 'Backspace') {
    return { type: 'backspace' };
  }
  if (key === 'Escape' || key === 'c' || key === 'C') {
    return { type: 'clear' };
  }
  if (key === '%') {
    return { type: 'percent' };
  }
  return null;
}

function WidgetComp(_props: WidgetReactComponentProps<Settings>) {
  const [state, dispatch] = useReducer(calcReducer, initialCalcState);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = keyToAction(e.key);
    if (action) {
      e.preventDefault();
      dispatch(action);
    }
  };

  return (
    <div className={styles['calculator']} tabIndex={0} onKeyDown={onKeyDown} data-widget-context="">
      <div className={styles['display']} data-testid="calc-display">{state.display}</div>
      <div className={styles['keys']}>
        {buttons.map(b => (
          <button
            key={b.label}
            type="button"
            className={clsx(
              styles['key'],
              b.kind === 'op' && styles['is-op'],
              b.kind === 'fn' && styles['is-fn'],
              b.kind === 'eq' && styles['is-eq'],
              b.wide && styles['is-wide'],
            )}
            onClick={() => dispatch(b.action)}
          >{b.label}</button>
        ))}
      </div>
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
