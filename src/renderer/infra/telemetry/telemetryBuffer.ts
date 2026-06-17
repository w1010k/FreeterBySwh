/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent, telemetryEventsKey, toLocalDateStr } from '@common/base/telemetry';

export interface TelemetryBuffer {
  /** Persist events, appending each to its local-day log. Read-modify-write, serialized. */
  appendEvents(events: readonly TelemetryEvent[]): Promise<void>;
}

type Deps = {
  storage: DataStorageJson;
  dateOf?: (ts: number) => string;
}

/**
 * Appends telemetry events to per-day files (`events-YYYY-MM-DD`). Writes are
 * serialized through a promise chain so concurrent flushes can't clobber each
 * other's read-modify-write.
 */
export function createTelemetryBuffer({ storage, dateOf = (ts) => toLocalDateStr(ts) }: Deps): TelemetryBuffer {
  let chain: Promise<void> = Promise.resolve();

  const doAppend = async (events: readonly TelemetryEvent[]): Promise<void> => {
    if (events.length === 0) {
      return;
    }
    const byDate = new Map<string, TelemetryEvent[]>();
    for (const ev of events) {
      const date = dateOf(ev.ts);
      const arr = byDate.get(date);
      if (arr) {
        arr.push(ev);
      } else {
        byDate.set(date, [ev]);
      }
    }
    for (const [date, dayEvents] of byDate) {
      const key = telemetryEventsKey(date);
      const existing = await storage.getJson(key);
      const arr = Array.isArray(existing) ? existing as TelemetryEvent[] : [];
      await storage.setJson(key, arr.concat(dayEvents));
    }
  }

  return {
    appendEvents: (events) => {
      const next = chain.then(() => doAppend(events));
      // Keep the chain alive even if a write rejects, so later appends still run.
      chain = next.catch(() => undefined);
      return next;
    }
  }
}
