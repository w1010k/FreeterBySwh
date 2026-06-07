/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { formatClock } from './clock';
import styles from './widget.module.scss';
import { useEffect, useState } from 'react';

function WidgetComp({settings}: WidgetReactComponentProps<Settings>) {
  const [now, setNow] = useState(() => new Date());
  // Tick every second. The shown values derive from `now` via Intl, so a single
  // timer drives every clock entry; we don't bother aligning to the minute even
  // when seconds are hidden — one cheap setState/sec for one widget.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles['clock']}>
      {settings.entries.map(entry => {
        const { time, date } = formatClock(now, {
          timeZone: entry.timeZone,
          hour12: settings.hour12,
          showSeconds: settings.showSeconds,
          showDate: settings.showDate,
        });
        return (
          <div key={entry.id} className={styles['entry']}>
            {entry.label !== '' && <div className={styles['label']}>{entry.label}</div>}
            <div className={styles['time']}>{time}</div>
            {date && <div className={styles['date']}>{date}</div>}
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
