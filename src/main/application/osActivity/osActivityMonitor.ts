/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ForegroundWindowReader, ForegroundWindowSample } from '@/infra/osActivity/foregroundWindow';

export interface OsActivityEvent {
  type: 'os_window' | 'system_event';
  text: string;
  detail?: string;
  durationMs?: number;
}

/** Minimal subset of Electron's powerMonitor used here (injectable for tests). */
export interface PowerMonitorLike {
  on(event: 'lock-screen' | 'unlock-screen' | 'suspend' | 'resume', listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
  /** System-wide input idle time, in seconds. */
  getSystemIdleTime(): number;
}

type Deps = {
  reader: ForegroundWindowReader;
  powerMonitor: PowerMonitorLike;
  now: () => number;
  emit: (event: OsActivityEvent) => void;
  /** No foreground input for this long (sec) ends the current app segment. */
  idleThresholdSec?: number;
}

export interface OsActivityMonitor {
  start(): void;
  stop(): void;
}

const DEFAULT_IDLE_THRESHOLD_SEC = 180;

export function createOsActivityMonitor({
  reader,
  powerMonitor,
  now,
  emit,
  idleThresholdSec = DEFAULT_IDLE_THRESHOLD_SEC,
}: Deps): OsActivityMonitor {
  let current: { app: string; title: string; since: number } | null = null;
  let running = false;

  const closeAt = (endTs: number) => {
    if (!current) {
      return;
    }
    const effEnd = Math.max(current.since, endTs);
    const durationMs = effEnd - current.since;
    if (durationMs > 0) {
      emit({ type: 'os_window', text: current.app || 'Unknown', detail: current.title, durationMs });
    }
    current = null;
  }

  const handleSample = (sample: ForegroundWindowSample) => {
    const nowTs = now();
    const idleSec = powerMonitor.getSystemIdleTime();
    if (idleSec >= idleThresholdSec) {
      // User went idle — close the segment at the moment input last happened.
      closeAt(nowTs - idleSec * 1000);
      return;
    }
    const app = sample.app || 'Unknown';
    if (!current) {
      current = { app, title: sample.title, since: nowTs };
      return;
    }
    if (app !== current.app || sample.title !== current.title) {
      closeAt(nowTs);
      current = { app, title: sample.title, since: nowTs };
    }
  }

  const onLock = () => { closeAt(now()); emit({ type: 'system_event', text: 'lock' }); };
  const onUnlock = () => { emit({ type: 'system_event', text: 'unlock' }); };
  const onSuspend = () => { closeAt(now()); emit({ type: 'system_event', text: 'suspend' }); };
  const onResume = () => { emit({ type: 'system_event', text: 'resume' }); };

  return {
    start: () => {
      if (running) {
        return;
      }
      running = true;
      current = null;
      reader.start(handleSample);
      powerMonitor.on('lock-screen', onLock);
      powerMonitor.on('unlock-screen', onUnlock);
      powerMonitor.on('suspend', onSuspend);
      powerMonitor.on('resume', onResume);
    },
    stop: () => {
      if (!running) {
        return;
      }
      running = false;
      closeAt(now());
      reader.stop();
      powerMonitor.removeListener('lock-screen', onLock);
      powerMonitor.removeListener('unlock-screen', onUnlock);
      powerMonitor.removeListener('suspend', onSuspend);
      powerMonitor.removeListener('resume', onResume);
    }
  }
}
