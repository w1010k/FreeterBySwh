/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createTelemetryCollector } from '@/application/telemetry/telemetryCollector';
import { TelemetryConfig } from '@/base/appConfig';
import { TelemetryBuffer } from '@/infra/telemetry/telemetryBuffer';
import { TelemetryEvent } from '@common/base/telemetry';

function setup(initialConfig?: Partial<TelemetryConfig>) {
  let t = 1_000_000;
  const config: TelemetryConfig = { enabled: true, idleTimeoutMs: 5000, ...initialConfig };
  const appended: TelemetryEvent[] = [];
  const buffer: TelemetryBuffer = {
    appendEvents: async (events) => { appended.push(...events); }
  };
  const collector = createTelemetryCollector({
    now: () => t,
    getConfig: () => config,
    buffer,
    heartbeatSplitMs: 60_000,
  });
  return {
    collector,
    appended,
    config,
    advance: (ms: number) => { t += ms; },
    at: (ms: number) => { t = ms; },
    flushAndGet: async () => { await collector.flush(); return appended; }
  }
}

describe('telemetryCollector', () => {
  it('records nothing while disabled', async () => {
    const { collector, config, flushAndGet } = setup({ enabled: false });
    config.enabled = false;
    collector.onAppFocus();
    collector.syncCurrent('p1', 'w1');
    collector.onActivity(true);
    collector.onAppBlur();

    expect(collector.pendingCount()).toBe(0);
    expect(await flushAndGet()).toEqual([]);
  });

  it('emits project_switch and workflow_open on first sync', () => {
    const { collector } = setup();
    collector.syncCurrent('p1', 'w1');

    expect(collector.pendingCount()).toBe(2);
  });

  it('emits workflow_close with focused presence duration on workflow change', async () => {
    const { collector, advance, flushAndGet } = setup();
    collector.onAppFocus();
    collector.syncCurrent('p1', 'w1');
    advance(3000);
    collector.syncCurrent('p1', 'w2');

    const events = await flushAndGet();
    const close = events.find(e => e.type === 'workflow_close');
    expect(close).toMatchObject({ type: 'workflow_close', wflId: 'w1', durationMs: 3000 });
    // new workflow opened, project not switched again
    expect(events.filter(e => e.type === 'workflow_open').map(e => e.wflId)).toEqual(['w1', 'w2']);
    expect(events.filter(e => e.type === 'project_switch')).toHaveLength(1);
  });

  it('emits app_blur with focused wall-clock duration and an activity_tick', async () => {
    const { collector, advance, flushAndGet } = setup();
    collector.onAppFocus();
    advance(2000);
    collector.onActivity(false); // activity within idle window
    advance(1000);
    collector.onAppBlur();

    const events = await flushAndGet();
    const blur = events.find(e => e.type === 'app_blur');
    expect(blur).toMatchObject({ type: 'app_blur', durationMs: 3000 });
    const tick = events.find(e => e.type === 'activity_tick');
    // active interval closed at last activity (t+2000), so 2000ms active
    expect(tick).toMatchObject({ type: 'activity_tick', durationMs: 2000 });
  });

  it('counts keystrokes into the activity_tick count', async () => {
    const { collector, advance, flushAndGet } = setup();
    collector.onAppFocus();
    collector.onActivity(true);
    advance(100);
    collector.onActivity(true);
    advance(100);
    collector.onActivity(false);
    collector.onAppBlur();

    const events = await flushAndGet();
    const tick = events.find(e => e.type === 'activity_tick');
    expect(tick?.count).toBe(2);
  });

  it('trims an idle gap: closes the interval at last activity', async () => {
    const { collector, advance, flushAndGet } = setup({ idleTimeoutMs: 5000 });
    collector.onAppFocus(); // t0, interval starts
    advance(2000);
    collector.onActivity(false); // active up to t0+2000
    advance(10000); // idle for 10s (> 5s threshold)
    collector.onActivity(false); // resumes; previous interval closed at t0+2000
    advance(1000);
    collector.onActivity(false); // last activity at resume+1000
    collector.onAppBlur(); // trims second interval to last activity

    const events = await flushAndGet();
    const ticks = events.filter(e => e.type === 'activity_tick');
    // first interval: t0..t0+2000 = 2000ms; second: resume..resume+1000 = 1000ms
    expect(ticks.map(t => t.durationMs)).toEqual([2000, 1000]);
  });

  it('heartbeat splits a long continuous active interval', async () => {
    const { collector, advance, flushAndGet } = setup({ idleTimeoutMs: 120_000 });
    collector.onAppFocus();
    advance(30_000);
    collector.onActivity(false);
    advance(40_000); // 70s since interval start (> 60s split)
    collector.heartbeat(); // should split here
    collector.onAppBlur();

    const events = await flushAndGet();
    const ticks = events.filter(e => e.type === 'activity_tick');
    expect(ticks.length).toBeGreaterThanOrEqual(1);
    // total active time preserved (~70s) across splits
    const total = ticks.reduce((s, t) => s + (t.durationMs ?? 0), 0);
    expect(total).toBe(70_000);
  });

  it('markActiveBoundary emits in-progress active time and continues the interval', async () => {
    const { collector, advance, flushAndGet } = setup();
    collector.onAppFocus(); // interval starts at t0
    advance(2000);
    collector.onActivity(false); // last activity t0+2000
    advance(1000); // now t0+3000, still within idle window

    collector.markActiveBoundary(); // should emit [t0, t0+3000] = 3000ms and continue

    advance(1000);
    collector.onActivity(false); // last activity t0+4000
    collector.onAppBlur(); // closes [t0+3000, t0+4000] = 1000ms

    const ticks = (await flushAndGet()).filter(e => e.type === 'activity_tick');
    expect(ticks.map(t => t.durationMs)).toEqual([3000, 1000]); // no overlap, no lost time
  });

  it('markActiveBoundary is a no-op when blurred or idle-with-no-interval', async () => {
    const { collector, flushAndGet } = setup();
    collector.markActiveBoundary(); // not focused
    expect(await flushAndGet()).toEqual([]);
  });

  it('flush clears pending and forwards to the buffer', async () => {
    const { collector, appended } = setup();
    collector.syncCurrent('p1', 'w1');
    expect(collector.pendingCount()).toBeGreaterThan(0);

    await collector.flush();

    expect(collector.pendingCount()).toBe(0);
    expect(appended.length).toBeGreaterThan(0);
  });

  it('records activity events tagged with the current workflow', async () => {
    const { collector, flushAndGet } = setup();
    collector.syncCurrent('p1', 'w1');
    collector.recordActivity('web_search', { text: 'hello' });
    collector.recordActivity('file_open', { text: 'a.ts', detail: '/x/a.ts', widgetId: 'wid1' });

    const events = await flushAndGet();
    const search = events.find(e => e.type === 'web_search');
    expect(search).toMatchObject({ type: 'web_search', text: 'hello', prjId: 'p1', wflId: 'w1' });
    const file = events.find(e => e.type === 'file_open');
    expect(file).toMatchObject({ text: 'a.ts', detail: '/x/a.ts', widgetId: 'wid1' });
  });

  it('does not record activity while disabled', async () => {
    const { collector, config } = setup();
    config.enabled = false;
    collector.recordActivity('web_search', { text: 'secret' });

    expect(collector.pendingCount()).toBe(0);
  });

  it('does not start a workflow presence interval while blurred', async () => {
    const { collector, advance, flushAndGet } = setup();
    // sync while not focused -> open event but no presence timer
    collector.syncCurrent('p1', 'w1');
    advance(5000);
    collector.syncCurrent('p1', 'w2');

    const events = await flushAndGet();
    expect(events.find(e => e.type === 'workflow_close')).toBeUndefined();
  });
})
