/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TelemetryDay } from '@/application/useCases/telemetry/readTelemetryEvents';
import { isTelemetryActivityEvent, TelemetryEntitiesSnapshot, TelemetryEventType } from '@common/base/telemetry';

export interface TimelineEntry {
  ts: number;
  /** 'HH:MM' local time. */
  time: string;
  type: TelemetryEventType;
  text: string;
  detail?: string;
  workflowName?: string;
}

export interface TimelineDay {
  date: string;
  entries: TimelineEntry[];
}

function defaultTimeOf(ts: number): string {
  const d = new Date(ts);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * Builds a per-day activity timeline (most recent day first, newest entry first)
 * from raw events, keeping only the semantic activity events and resolving
 * workflow ids to names.
 */
export function buildActivityTimeline(
  days: readonly TelemetryDay[],
  entities: TelemetryEntitiesSnapshot,
  timeOf: (ts: number) => string = defaultTimeOf
): TimelineDay[] {
  const wflName = new Map(entities.workflows.map(w => [w.id, w.name]));

  return days
    .map(({ date, events }): TimelineDay => ({
      date,
      entries: events
        .filter(e => isTelemetryActivityEvent(e.type))
        .map((e): TimelineEntry => ({
          ts: e.ts,
          time: timeOf(e.ts),
          type: e.type,
          text: e.text ?? '',
          ...(e.detail ? { detail: e.detail } : {}),
          ...(e.wflId && wflName.get(e.wflId) ? { workflowName: wflName.get(e.wflId) } : {}),
        }))
        .sort((a, b) => b.ts - a.ts),
    }))
    .filter(day => day.entries.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}
