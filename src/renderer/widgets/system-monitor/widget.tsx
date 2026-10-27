/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { formatBytes, formatUptime, toPercent } from './systemMonitor';
import { SystemStats } from '@common/base/systemStats';
import styles from './widget.module.scss';
import { ReactNode, useEffect, useState } from 'react';

const pollMsec = 2000;

// Battery Status API; not in TypeScript's DOM lib.
interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
}
type BatteryState = { level: number; charging: boolean };

const batteryEvents = ['levelchange', 'chargingchange', 'chargingtimechange'];

/** Battery level, or null when the API is missing or reports no battery. */
function useBattery(): BatteryState | null {
  const [battery, setBattery] = useState<BatteryState | null>(null);
  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery;
    if (!getBattery) {
      return undefined;
    }
    let cancelled = false;
    let mgr: BatteryManager | null = null;
    const update = () => {
      if (!mgr) {
        return;
      }
      // Chromium reports a machine without a battery as fully charged on AC with chargingTime 0.
      // ponytail: a full laptop on AC looks the same and is hidden too; no dependency-free way to tell them apart.
      const noBattery = mgr.charging && mgr.level === 1 && mgr.chargingTime === 0;
      setBattery(noBattery ? null : { level: mgr.level, charging: mgr.charging });
    };
    getBattery.call(navigator).then(m => {
      if (cancelled) {
        return;
      }
      mgr = m;
      batteryEvents.forEach(e => m.addEventListener(e, update));
      update();
    }).catch(() => { /* API refused: leave the battery row hidden */ });
    return () => {
      cancelled = true;
      batteryEvents.forEach(e => mgr?.removeEventListener(e, update));
    };
  }, []);
  return battery;
}

function Metric({ label, percent, children }: { label: string; percent: number; children?: ReactNode }) {
  return (
    <div className={styles['metric']}>
      <div className={styles['head']}>
        <span className={styles['label']}>{label}</span>
        <span className={styles['val']}>{percent}%</span>
      </div>
      <div className={styles['bar']}><div className={styles['fill']} style={{ width: `${percent}%` }} /></div>
      {children}
    </div>
  );
}

function WidgetComp({widgetApi}: WidgetReactComponentProps<Settings>) {
  const { systemStats } = widgetApi;
  const [stats, setStats] = useState<SystemStats | null>(null);
  const battery = useBattery();

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
  const disk = stats?.disk;

  return (
    <div className={styles['sysmon']}>
      <Metric label='CPU' percent={cpu}>
        {stats && stats.cpuCorePercents.length > 1 && (
          <div className={styles['cores']} title='Per-core usage'>
            {stats.cpuCorePercents.map((p, i) => (
              <div key={i} className={styles['core']}><div className={styles['core-fill']} style={{ height: `${toPercent(p)}%` }} /></div>
            ))}
          </div>
        )}
      </Metric>
      <Metric label='RAM' percent={memPct}>
        {stats && <div className={styles['detail']}>{formatBytes(stats.memUsedBytes)} / {formatBytes(stats.memTotalBytes)}</div>}
      </Metric>
      {disk && disk.totalBytes > 0 && (
        <Metric label='Disk' percent={toPercent(100 * disk.usedBytes / disk.totalBytes)}>
          <div className={styles['detail']}>{formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}</div>
        </Metric>
      )}
      {stats && (
        <Metric label='Freeter' percent={toPercent(stats.appCpuPercent)}>
          <div className={styles['detail']}>{formatBytes(stats.appMemBytes)}</div>
        </Metric>
      )}
      {battery && (
        <Metric label='Battery' percent={toPercent(100 * battery.level)}>
          <div className={styles['detail']}>{battery.charging ? 'Charging' : 'On battery'}</div>
        </Metric>
      )}
      {stats && <div className={styles['detail']}>Uptime {formatUptime(stats.uptimeSec)}</div>}
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
