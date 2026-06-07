/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { formatDDay, formatDateWithWeekday } from './dDay';
import styles from './widget.module.scss';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

function WidgetComp({settings}: WidgetReactComponentProps<Settings>) {
  // Re-evaluate at local midnight so the counts roll over without a manual
  // refresh. `now` drives the recompute; the effect reschedules itself for the
  // next midnight after each tick (no per-second/minute churn).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const current = new Date();
    const nextMidnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 1).getTime();
    const timer = setTimeout(() => setNow(new Date()), Math.max(1000, nextMidnight - current.getTime()));
    return () => clearTimeout(timer);
  }, [now]);

  return (
    <div className={styles['d-day']}>
      {settings.entries.map(entry => {
        const res = entry.date ? formatDDay(entry.date, now) : null;
        const dateLine = settings.showDate ? formatDateWithWeekday(entry.date) : null;
        return (
          <div key={entry.id} className={styles['entry']} title={entry.date || undefined}>
            <div className={styles['row']}>
              <span className={styles['label']}>{entry.label || '(No label)'}</span>
              <span className={clsx(styles['count'], res?.isToday && styles['is-today'])}>
                {res ? res.text : '—'}
              </span>
            </div>
            {dateLine && <div className={styles['date']}>{dateLine}</div>}
          </div>
        );
      })}
    </div>
  )
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
