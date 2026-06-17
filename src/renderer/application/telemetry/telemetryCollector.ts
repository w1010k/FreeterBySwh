/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TelemetryConfig } from '@/base/appConfig';
import { TelemetryBuffer } from '@/infra/telemetry/telemetryBuffer';
import { TelemetryEvent, TelemetryEventType } from '@common/base/telemetry';

export interface TelemetryActivityOpts {
  text?: string;
  detail?: string;
  widgetId?: string;
  durationMs?: number;
}

type Deps = {
  now: () => number;
  /** Read live consent + idle settings. When enabled is false, nothing is recorded. */
  getConfig: () => TelemetryConfig;
  buffer: TelemetryBuffer;
  /** Split a continuous active interval after this long, for hour-bucket accuracy. */
  heartbeatSplitMs?: number;
}

export interface TelemetryCollector {
  /** Called whenever the current project/workflow changes (via store subscription). */
  syncCurrent(projectId: string, workflowId: string): void;
  onAppFocus(): void;
  onAppBlur(): void;
  /** A user input occurred. isKeystroke counts toward keystroke totals (count only). */
  onActivity(isKeystroke: boolean): void;
  /** Record a semantic activity-timeline event (search, page visit, file open, to-do done). */
  recordActivity(type: TelemetryEventType, opts?: TelemetryActivityOpts): void;
  /** Periodic tick: trims idle and splits long active intervals. */
  heartbeat(): void;
  /** Persist buffered events. Best-effort. */
  flush(): Promise<void>;
  /** Test/diagnostic: number of events buffered but not yet flushed. */
  pendingCount(): number;
}

const DEFAULT_HEARTBEAT_SPLIT_MS = 5 * 60 * 1000;

export function createTelemetryCollector({
  now,
  getConfig,
  buffer,
  heartbeatSplitMs = DEFAULT_HEARTBEAT_SPLIT_MS,
}: Deps): TelemetryCollector {
  let current: { prjId: string; wflId: string } | null = null;
  let focused = false;
  let focusStartTs: number | null = null;
  /** Start of the current open workflow presence interval (only while focused). */
  let wflOpenTs: number | null = null;
  /** Start of the current active (non-idle) interval. */
  let intervalStartTs: number | null = null;
  let lastActivityTs = 0;
  let intervalKeystrokes = 0;
  let pending: TelemetryEvent[] = [];

  const push = (ev: TelemetryEvent) => {
    if (getConfig().enabled) {
      pending.push(ev);
    }
  }

  const emitTick = (endTs: number) => {
    if (intervalStartTs === null) {
      return;
    }
    const durationMs = Math.max(0, endTs - intervalStartTs);
    if (durationMs > 0 || intervalKeystrokes > 0) {
      push({
        ts: endTs,
        type: 'activity_tick',
        durationMs,
        count: intervalKeystrokes,
        ...(current?.prjId ? { prjId: current.prjId } : {}),
        ...(current?.wflId ? { wflId: current.wflId } : {}),
      });
    }
  }

  const closeWorkflowInterval = (nowTs: number) => {
    if (current?.wflId && wflOpenTs !== null) {
      push({
        ts: nowTs,
        type: 'workflow_close',
        prjId: current.prjId,
        wflId: current.wflId,
        durationMs: Math.max(0, nowTs - wflOpenTs),
      });
    }
    wflOpenTs = null;
  }

  const openWorkflowInterval = (nowTs: number) => {
    if (current?.wflId && focused) {
      wflOpenTs = nowTs;
    }
  }

  return {
    syncCurrent: (projectId, workflowId) => {
      const n = now();
      const prevWfl = current?.wflId;
      const prevPrj = current?.prjId;
      const wflChanged = workflowId !== prevWfl;
      if (wflChanged) {
        closeWorkflowInterval(n);
      }
      current = { prjId: projectId, wflId: workflowId };
      if (projectId && projectId !== prevPrj) {
        push({ ts: n, type: 'project_switch', prjId: projectId });
      }
      if (wflChanged && workflowId) {
        push({ ts: n, type: 'workflow_open', prjId: projectId, wflId: workflowId });
        openWorkflowInterval(n);
      }
    },

    onAppFocus: () => {
      if (focused) {
        return;
      }
      const n = now();
      focused = true;
      focusStartTs = n;
      push({ ts: n, type: 'app_focus' });
      intervalStartTs = n;
      lastActivityTs = n;
      intervalKeystrokes = 0;
      openWorkflowInterval(n);
    },

    onAppBlur: () => {
      if (!focused) {
        return;
      }
      const n = now();
      emitTick(lastActivityTs);
      intervalStartTs = null;
      intervalKeystrokes = 0;
      closeWorkflowInterval(n);
      push({ ts: n, type: 'app_blur', durationMs: focusStartTs !== null ? Math.max(0, n - focusStartTs) : 0 });
      focused = false;
      focusStartTs = null;
    },

    onActivity: (isKeystroke) => {
      if (!focused) {
        return;
      }
      const n = now();
      const { idleTimeoutMs } = getConfig();
      if (intervalStartTs === null) {
        intervalStartTs = n;
        lastActivityTs = n;
        intervalKeystrokes = 0;
      }
      if (n - lastActivityTs > idleTimeoutMs) {
        // Gap longer than the idle threshold: close the interval at the last
        // known activity and start a fresh one now.
        emitTick(lastActivityTs);
        intervalStartTs = n;
        intervalKeystrokes = 0;
      }
      lastActivityTs = n;
      if (isKeystroke) {
        intervalKeystrokes += 1;
      }
    },

    recordActivity: (type, opts) => {
      push({
        ts: now(),
        type,
        ...(current?.prjId ? { prjId: current.prjId } : {}),
        ...(current?.wflId ? { wflId: current.wflId } : {}),
        ...(opts?.widgetId ? { widgetId: opts.widgetId } : {}),
        ...(opts?.text !== undefined ? { text: opts.text } : {}),
        ...(opts?.detail !== undefined ? { detail: opts.detail } : {}),
        ...(opts?.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
      });
    },

    heartbeat: () => {
      if (!focused || intervalStartTs === null) {
        return;
      }
      const n = now();
      const { idleTimeoutMs } = getConfig();
      if (n - lastActivityTs > idleTimeoutMs) {
        emitTick(lastActivityTs);
        intervalStartTs = null;
        intervalKeystrokes = 0;
        return;
      }
      if (n - intervalStartTs >= heartbeatSplitMs) {
        emitTick(n);
        intervalStartTs = n;
        intervalKeystrokes = 0;
      }
    },

    flush: async () => {
      if (pending.length === 0) {
        return;
      }
      const batch = pending;
      pending = [];
      try {
        await buffer.appendEvents(batch);
      } catch {
        // Persist failed — put the batch back ahead of anything buffered since,
        // so a transient failure doesn't silently drop events.
        pending = batch.concat(pending);
      }
    },

    pendingCount: () => pending.length,
  }
}
