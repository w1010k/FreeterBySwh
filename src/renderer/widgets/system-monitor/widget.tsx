/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { formatBytes, toPercent } from './systemMonitor';
import { SystemStats } from '@common/base/systemStats';
import styles from './widget.module.scss';
import { useEffect, useState } from 'react';

const pollMsec = 2000;

function WidgetComp({widgetApi}: WidgetReactComponentProps<Settings>) {
  const { systemStats } = widgetApi;
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await systemStats.getStats();
        if (!cancelled) {
          setStats(s);
        }
      } catch {
        /* transient IPC error — keep the last reading */
      }
    };
    poll();
    const id = setInterval(poll, pollMsec);
    return () => { cancelled = true; clearInterval(id); };
  }, [systemStats]);

  const cpu = stats ? toPercent(stats.cpuPercent) : 0;
  const memPct = stats && stats.memTotalBytes > 0 ? toPercent(100 * stats.memUsedBytes / stats.memTotalBytes) : 0;

  return (
    <div className={styles['sysmon']}>
      <div className={styles['metric']}>
        <div className={styles['head']}>
          <span className={styles['label']}>CPU</span>
          <span className={styles['val']}>{cpu}%</span>
        </div>
        <div className={styles['bar']}><div className={styles['fill']} style={{ width: `${cpu}%` }} /></div>
      </div>
      <div className={styles['metric']}>
        <div className={styles['head']}>
          <span className={styles['label']}>RAM</span>
          <span className={styles['val']}>{memPct}%</span>
        </div>
        <div className={styles['bar']}><div className={styles['fill']} style={{ width: `${memPct}%` }} /></div>
        {stats && <div className={styles['detail']}>{formatBytes(stats.memUsedBytes)} / {formatBytes(stats.memTotalBytes)}</div>}
      </div>
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
