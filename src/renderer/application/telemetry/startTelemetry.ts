/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { TelemetryCollector } from '@/application/telemetry/telemetryCollector';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { setOsMonitoring } from '@/infra/osActivity/osMonitoring';
import { ipcAppFocusChangedChannel, ipcOsActivityEventChannel, IpcOsActivityEventArgs } from '@common/ipc/channels';

const FLUSH_INTERVAL_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const MOUSEMOVE_THROTTLE_MS = 1_000;

type Deps = {
  appStore: AppStore;
  collector: TelemetryCollector;
}

/**
 * Wires up local usage telemetry: a store subscription for workflow/project
 * transitions, DOM listeners for activity, main→renderer app focus/blur, and
 * periodic heartbeat + flush. All collection is gated on the user's consent
 * inside the collector, so this can run unconditionally. The collector is built
 * in the composition root and shared with the widget API (for activity events).
 */
export function startTelemetry({ appStore, collector }: Deps) {
  // Track the current project/workflow via the store — this captures every code
  // path that changes them (switch, close, delete, project switch), not just the
  // explicit switch use cases.
  appStore.subscribe(
    state => {
      const prjId = state.ui.projectSwitcher.currentProjectId;
      const wflId = (prjId && state.entities.projects[prjId]?.currentWorkflowId) || '';
      return { prjId, wflId };
    },
    ({ prjId, wflId }) => collector.syncCurrent(prjId, wflId),
    { fireImmediately: true }
  );

  // OS-wide activity (foreground app/window + power/idle) from the main process.
  electronIpcRenderer.on(ipcOsActivityEventChannel, (event: IpcOsActivityEventArgs[0]) => {
    if (event && (event.type === 'os_window' || event.type === 'system_event')) {
      collector.recordActivity(event.type, { text: event.text, detail: event.detail, durationMs: event.durationMs });
    }
  });

  // Start/stop OS monitoring in main to match the live consent setting.
  const applyOsMonitoring = (enabled: boolean) => { setOsMonitoring(enabled); };
  applyOsMonitoring(appStore.get().ui.appConfig.telemetry.enabled);
  appStore.subscribe(
    state => state.ui.appConfig.telemetry.enabled,
    enabled => applyOsMonitoring(enabled)
  );

  // App foreground/background from the main process.
  electronIpcRenderer.on(ipcAppFocusChangedChannel, (focused) => {
    if (focused) {
      collector.onAppFocus();
    } else {
      collector.onAppBlur();
      collector.flush();
    }
  });

  // Seed the initial focus state (main's 'focus' event may not fire if the
  // window is already focused at startup).
  if (typeof document !== 'undefined' && document.hasFocus()) {
    collector.onAppFocus();
  }

  // User activity. Keystrokes count toward keystroke totals (count only).
  let lastMouseMove = 0;
  window.addEventListener('keydown', () => collector.onActivity(true), { capture: true });
  window.addEventListener('mousedown', () => collector.onActivity(false), { capture: true });
  window.addEventListener('wheel', () => collector.onActivity(false), { capture: true, passive: true });
  window.addEventListener('mousemove', () => {
    const now = Date.now();
    if (now - lastMouseMove >= MOUSEMOVE_THROTTLE_MS) {
      lastMouseMove = now;
      collector.onActivity(false);
    }
  }, { capture: true, passive: true });

  // visibilitychange as a backup for app focus (minimize, OS switching). The
  // collector's focus/blur guards make redundant signals idempotent.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      collector.onAppBlur();
      collector.flush();
    } else {
      collector.onAppFocus();
    }
  });

  window.setInterval(() => collector.heartbeat(), HEARTBEAT_INTERVAL_MS);
  window.setInterval(() => { collector.flush(); }, FLUSH_INTERVAL_MS);
  window.addEventListener('beforeunload', () => {
    collector.onAppBlur();
    collector.flush();
  });
}
