/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createOsActivityMonitor, OsActivityEvent, PowerMonitorLike } from '@/application/osActivity/osActivityMonitor';
import { ForegroundWindowReader, ForegroundWindowSample } from '@/infra/osActivity/foregroundWindow';

function setup() {
  let nowMs = 1000;
  let idleSec = 0;
  let cb: ((s: ForegroundWindowSample) => void) | null = null;
  let stopped = false;
  const reader: ForegroundWindowReader = {
    start: (onSample) => { cb = onSample; },
    stop: () => { stopped = true; },
  };
  const handlers: Record<string, () => void> = {};
  const powerMonitor: PowerMonitorLike = {
    on: (e, l) => { handlers[e] = l; },
    removeListener: (e, l) => { if (handlers[e] === l) { delete handlers[e]; } },
    getSystemIdleTime: () => idleSec,
  };
  const events: OsActivityEvent[] = [];
  const monitor = createOsActivityMonitor({
    reader, powerMonitor, now: () => nowMs, emit: e => events.push(e), idleThresholdSec: 60,
  });
  return {
    monitor, events,
    sample: (s: ForegroundWindowSample) => cb?.(s),
    fire: (e: string) => handlers[e]?.(),
    setNow: (ms: number) => { nowMs = ms; },
    setIdle: (s: number) => { idleSec = s; },
    isStopped: () => stopped,
    hasHandlers: () => Object.keys(handlers).length > 0,
  };
}

describe('osActivityMonitor', () => {
  it('emits os_window with duration when the foreground window changes', () => {
    const t = setup();
    t.monitor.start();

    t.setNow(1000); t.sample({ app: 'Code', title: 'a.ts' });
    t.setNow(4000); t.sample({ app: 'Code', title: 'a.ts' }); // same → no emit
    t.setNow(8000); t.sample({ app: 'Chrome', title: 'github' }); // change → close Code

    expect(t.events).toEqual([{ type: 'os_window', text: 'Code', detail: 'a.ts', durationMs: 7000 }]);
  });

  it('closes the segment at last-input time when the user goes idle', () => {
    const t = setup();
    t.monitor.start();
    t.setNow(8000); t.sample({ app: 'Chrome', title: 'github' });

    t.setNow(100000); t.setIdle(70); t.sample({ app: 'Chrome', title: 'github' }); // idle ≥ 60s

    // closed at 100000 - 70000 = 30000 → duration 30000-8000 = 22000
    expect(t.events).toEqual([{ type: 'os_window', text: 'Chrome', detail: 'github', durationMs: 22000 }]);

    // While still idle, no new segment / no further emits.
    t.setNow(110000); t.sample({ app: 'Chrome', title: 'github' });
    expect(t.events).toHaveLength(1);
  });

  it('never emits a negative/garbage duration when idle start precedes segment start', () => {
    const t = setup();
    t.monitor.start();
    t.setNow(50000); t.sample({ app: 'Code', title: 'x' }); // segment starts at 50000

    // Idle reported as 200s → idle-start = 50000-200000 < since(50000). Clamped → no emit.
    t.setNow(60000); t.setIdle(200); t.sample({ app: 'Code', title: 'x' });

    expect(t.events).toEqual([]);
  });

  it('emits system_event and closes the segment on lock', () => {
    const t = setup();
    t.monitor.start();
    t.setNow(1000); t.sample({ app: 'Slack', title: 'general' });

    t.setNow(11000); t.fire('lock-screen');

    expect(t.events).toEqual([
      { type: 'os_window', text: 'Slack', detail: 'general', durationMs: 10000 },
      { type: 'system_event', text: 'lock' },
    ]);
  });

  it('emits system_event for unlock/suspend/resume', () => {
    const t = setup();
    t.monitor.start();

    t.fire('unlock-screen');
    t.fire('suspend');
    t.fire('resume');

    expect(t.events.map(e => e.text)).toEqual(['unlock', 'suspend', 'resume']);
  });

  it('flushes the open segment and detaches listeners on stop', () => {
    const t = setup();
    t.monitor.start();
    t.setNow(1000); t.sample({ app: 'Code', title: 'x' });

    t.setNow(5000); t.monitor.stop();

    expect(t.events).toEqual([{ type: 'os_window', text: 'Code', detail: 'x', durationMs: 4000 }]);
    expect(t.isStopped()).toBe(true);
    expect(t.hasHandlers()).toBe(false);
  });

  it('labels an empty app name as Unknown', () => {
    const t = setup();
    t.monitor.start();
    t.setNow(1000); t.sample({ app: '', title: 'x' });
    t.setNow(3000); t.monitor.stop();

    expect(t.events[0]).toMatchObject({ text: 'Unknown', durationMs: 2000 });
  });

  it('is idempotent on double start/stop', () => {
    const t = setup();
    t.monitor.start();
    t.monitor.start(); // no throw / no double-register
    t.monitor.stop();
    t.monitor.stop();
    expect(t.events).toEqual([]);
  });
})
