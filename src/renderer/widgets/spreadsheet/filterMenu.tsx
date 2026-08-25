/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {useEffect, useMemo, useRef, useState} from 'react';
import {Filter, FilterOp} from './grid';
import styles from './widget.module.scss';

/** Conditions offered for a column, chosen by what the column mostly holds. */
const NUMBER_OPS: { op: FilterOp; label: string }[] = [
  {op: 'eq', label: '='},
  {op: 'gt', label: '>'},
  {op: 'ge', label: '≥'},
  {op: 'lt', label: '<'},
  {op: 'le', label: '≤'},
  {op: 'between', label: 'between'}
];
const TEXT_OPS: { op: FilterOp; label: string }[] = [
  {op: 'contains', label: 'contains'},
  {op: 'startsWith', label: 'starts with'},
  {op: 'eq', label: 'equals'}
];

interface Props {
  /** Every distinct value in the column, already in display form. */
  values: string[];
  /** Numeric columns get comparison operators, text columns get matching ones. */
  numeric: boolean;
  filter: Filter | undefined;
  onApply: (next: Filter | undefined) => void;
  onClose: () => void;
}

/**
 * The column filter dropdown: a searchable checklist of the values in the
 * column, plus one condition. Drawn here rather than as a native menu — the
 * platform menu has no room for a search box or a scrolling checklist.
 */
export function FilterMenu({values, numeric, filter, onApply, onClose}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  // Undefined in the filter means "everything"; the UI works with a concrete set.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(filter?.values ?? values));
  const [op, setOp] = useState<FilterOp | ''>(filter?.cond?.op ?? '');
  const [a, setA] = useState(filter?.cond?.a ?? '');
  const [b, setB] = useState(filter?.cond?.b ?? '');

  const ops = numeric ? NUMBER_OPS : TEXT_OPS;
  const shown = useMemo(
    () => values.filter(v => v.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
    [values, search]
  );
  const allShownPicked = shown.length > 0 && shown.every(v => picked.has(v));

  // Clicking anywhere else puts the dropdown away, the way a menu behaves.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Deferred: the very click that opened this would otherwise close it.
    const id = setTimeout(() => document.addEventListener('mousedown', away), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', away);
    };
  }, [onClose]);

  const toggle = (v: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(v)) {
      next.delete(v);
    } else {
      next.add(v);
    }
    return next;
  });

  const apply = () => {
    const everything = values.every(v => picked.has(v));
    const cond = op && a.trim() !== '' ? {op, a, ...(op === 'between' ? {b} : {})} : undefined;
    // Nothing restricted means no filter at all, which keeps the column marker off.
    onApply(everything && !cond ? undefined : {values: everything ? undefined : [...picked], cond});
  };

  return (
    <div
      className={styles['filter-menu']}
      ref={boxRef}
      // The sheet owns the keyboard; keystrokes in here are not cell input.
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          onClose();
        }
        if (e.key === 'Enter') {
          apply();
        }
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <input
        className={styles['filter-search']}
        placeholder='Search'
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />

      <label className={styles['filter-all']}>
        <input
          type='checkbox'
          checked={allShownPicked}
          onChange={() => setPicked(prev => {
            const next = new Set(prev);
            shown.forEach(v => (allShownPicked ? next.delete(v) : next.add(v)));
            return next;
          })}
        />
        (Select All)
      </label>

      <ul className={styles['filter-list']}>
        {shown.map(v => (
          <li key={v}>
            <label>
              <input type='checkbox' checked={picked.has(v)} onChange={() => toggle(v)}/>
              {v === '' ? '(Blanks)' : v}
            </label>
          </li>
        ))}
      </ul>

      <div className={styles['filter-cond']}>
        <select value={op} onChange={e => setOp(e.target.value as FilterOp | '')}>
          <option value=''>No condition</option>
          {ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        {op !== '' && <input value={a} onChange={e => setA(e.target.value)} placeholder='value'/>}
        {op === 'between' && <input value={b} onChange={e => setB(e.target.value)} placeholder='and'/>}
      </div>

      <div className={styles['filter-actions']}>
        <button type='button' onClick={() => onApply(undefined)}>Clear</button>
        <button type='button' onClick={apply}>Apply</button>
      </div>
    </div>
  )
}
