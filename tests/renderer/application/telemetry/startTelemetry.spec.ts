/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { startTelemetry } from '@/application/telemetry/startTelemetry';
import { createTelemetryCollector } from '@/application/telemetry/telemetryCollector';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppConfig } from '@tests/base/fixtures/appConfig';
import { TelemetryEvent } from '@common/base/telemetry';

jest.mock('@/infra/mainApi/mainApi');

describe('telemetry consent changes', () => {
  it.each([false, true])('excludes disabled time and input after enabling (initially enabled: %s)', async initiallyEnabled => {
    jest.useFakeTimers();
    const windowListener = jest.spyOn(window, 'addEventListener');
    const documentListener = jest.spyOn(document, 'addEventListener');
    try {
      const [appStore] = await fixtureAppStore(fixtureAppState({
        ui: { appConfig: fixtureAppConfig({ telemetry: { enabled: initiallyEnabled, idleTimeoutMs: 300_000 } }) },
      }));
      const setEnabled = (enabled: boolean) => {
        const state = appStore.get();
        appStore.set({
          ...state,
          ui: { ...state.ui, appConfig: {
            ...state.ui.appConfig,
            telemetry: { ...state.ui.appConfig.telemetry, enabled },
          } },
        });
      };
      let now = 1000;
      const events: TelemetryEvent[] = [];
      const collector = createTelemetryCollector({
        now: () => now,
        getConfig: () => appStore.get().ui.appConfig.telemetry,
        buffer: { appendEvents: async batch => { events.push(...batch); } },
      });
      startTelemetry({ appStore, collector });
      collector.onAppFocus();
      setEnabled(false);
      now += 2000;
      collector.onActivity(true);
      now += 2000;
      setEnabled(true);
      now += 1000;
      collector.onActivity(true);
      collector.onAppBlur();
      await collector.flush();

      expect(events.filter(e => e.type === 'activity_tick')).toEqual([
        expect.objectContaining({ durationMs: 1000, count: 1 }),
      ]);
      expect(events.find(e => e.type === 'app_blur')).toMatchObject({ durationMs: 1000 });
    } finally {
      for (const [type, listener, options] of windowListener.mock.calls) {
        window.removeEventListener(type, listener, options);
      }
      for (const [type, listener, options] of documentListener.mock.calls) {
        document.removeEventListener(type, listener, options);
      }
      jest.clearAllTimers();
      jest.restoreAllMocks();
      jest.useRealTimers();
    }
  });
});
