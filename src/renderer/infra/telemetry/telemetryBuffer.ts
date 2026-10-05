/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DataStorage, DataStorageJson } from '@common/application/interfaces/dataStorage';
import { TelemetryEvent, telemetryEventsKey, toLocalDateStr } from '@common/base/telemetry';

export interface TelemetryBuffer {
  /**
   * Persist events, appending each to its local-day log. Read-modify-write, serialized.
   * Rejects with `TelemetryAppendError` listing the events of the days that could not be written.
   */
  appendEvents(events: readonly TelemetryEvent[]): Promise<void>;
}

/**
 * Thrown when some days of a batch could not be written. `failed` holds only
 * those days' events, so the caller re-queues them without duplicating the
 * days that did reach disk.
 */
export class TelemetryAppendError extends Error {
  constructor(readonly failed: TelemetryEvent[], cause: unknown) {
    super('Telemetry: some day files could not be written', { cause });
  }
}

type Deps = {
  storage: DataStorage & DataStorageJson;
  dateOf?: (ts: number) => string;
}

/**
 * Appends telemetry events to per-day files (`events-YYYY-MM-DD`). Writes are
 * serialized through a promise chain so concurrent flushes can't clobber each
 * other's read-modify-write.
 *
 * The day file is the only copy of that day's events, so a read that can't
 * prove the file is empty must not lead to an overwrite: `getText` returns
 * `undefined` both for a missing file and for a failed read. In that case the
 * day's events are reported back in `TelemetryAppendError` for the next flush,
 * while the other days in the batch are still written. A file that reads fine
 * but is not an event array is copied to a `corrupt-` key (outside the
 * `events-` prefix the Analytics page reads) and the day starts fresh;
 * retrying it would block that day forever.
 *
 * The last written day is cached in memory, so the steady 15s flushes don't
 * re-read (and re-parse) the file. The Analytics page's Clear deletes the
 * files in main behind this cache, so a cache hit is used only while the key
 * still exists (a directory listing, much cheaper than reading the day).
 * ponytail: the whole day file is still rewritten on each flush; a main-side
 * append channel is the upgrade if day files grow large.
 */
export function createTelemetryBuffer({ storage, dateOf = (ts) => toLocalDateStr(ts) }: Deps): TelemetryBuffer {
  let chain: Promise<void> = Promise.resolve();
  let cached: { key: string, events: TelemetryEvent[] } | null = null;

  // Reads a day file. Throws when the file exists but could not be read, so the
  // caller keeps that day's events; backs up and returns [] when it is not an event array.
  const readDay = async (key: string): Promise<TelemetryEvent[]> => {
    if (cached?.key === key) {
      if ((await storage.getKeys()).includes(key)) {
        return cached.events;
      }
      cached = null;
    }
    const text = await storage.getText(key);
    if (text === undefined) {
      if ((await storage.getKeys()).includes(key)) {
        throw new Error(`Telemetry: could not read '${key}'`);
      }
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!Array.isArray(parsed)) {
      await storage.setText(`corrupt-${key}-${Date.now()}`, text);
      return [];
    }
    return parsed as TelemetryEvent[];
  }

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
    // Each day succeeds or fails on its own, so one unreadable day neither
    // blocks the other days nor gets them written twice on the retry.
    const failed: TelemetryEvent[] = [];
    let firstErr: unknown;
    for (const [date, dayEvents] of byDate) {
      const key = telemetryEventsKey(date);
      try {
        const next = (await readDay(key)).concat(dayEvents);
        try {
          await storage.setJson(key, next);
        } catch (err) {
          // Unknown what reached disk; re-read the file next time.
          cached = null;
          throw err;
        }
        cached = { key, events: next };
      } catch (err) {
        failed.push(...dayEvents);
        firstErr ??= err;
      }
    }
    if (failed.length > 0) {
      throw new TelemetryAppendError(failed, firstErr);
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
