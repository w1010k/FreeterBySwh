/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  DailyRollup,
  TelemetryEntitiesSnapshot,
  TelemetryEvent,
  telemetryEventTypeLabels,
  telemetrySchemaVersion,
} from '@common/base/telemetry';

export interface TelemetryExportInput {
  events: TelemetryEvent[];
  daily: DailyRollup[];
  entities: TelemetryEntitiesSnapshot;
  /** ISO 8601 string; pass from the use case (Date is impure). */
  generatedAt: string;
  /** IANA timezone the day buckets were computed in. */
  timezone: string;
}

export interface TelemetryExportBundle {
  manifest: {
    app: string;
    schemaVersion: number;
    generatedAt: string;
    timezone: string;
    eventCount: number;
    dayCount: number;
    fields: Record<string, string>;
    eventTypes: Record<string, string>;
    notes: string[];
  };
  entities: TelemetryEntitiesSnapshot;
  events: TelemetryEvent[];
  daily: DailyRollup[];
  readme: string;
}

const FIELD_DICTIONARY: Record<string, string> = {
  'event.ts': 'Epoch milliseconds (UTC) when the event occurred',
  'event.type': 'Event kind — see manifest.eventTypes',
  'event.prjId': 'Project id — join with entities.projects[].id for the name',
  'event.wflId': 'Workflow id — join with entities.workflows[].id for the name',
  'event.widgetId': 'Widget id (reserved; not populated in this version)',
  'event.durationMs': 'Interval length in ms (app_blur, workflow_close, activity_tick)',
  'event.count': 'Keystroke count during the interval (activity_tick) — count only, never content',
  'event.text': 'Activity label: search query / page title / file name / to-do text (web_search, page_visit, file_open, todo_done)',
  'event.detail': 'Activity secondary detail: page URL or full file path',
  'daily.activeMs': 'Foreground, non-idle time that day (ms)',
  'daily.typingActiveMs': 'Active time during which keystrokes occurred (ms)',
  'daily.perWorkflowMs': 'Focused presence time per workflow id (ms)',
  'daily.perAppMs': 'Foreground time per OS app name (ms), from os_window events',
  'daily.perHour': 'Active ms bucketed by local hour-of-day (length 24)',
};

const README = `# Freeter usage activity export

This file is a **local, self-describing** snapshot of how this Freeter install was
used. It was produced with the user's consent. Keystrokes are recorded as counts only
(never the keys themselves), and note contents are never recorded. It DOES include an
activity timeline the user opted into: Web Query searches, visited page titles/URLs,
opened file paths, and completed to-dos (events web_search / page_visit / file_open /
todo_done; the text lives in event.text, with event.detail for URLs/paths). When OS-wide
tracking is on it also includes which app/window was in the foreground and for how long
(os_window) plus system idle/lock events (system_event).

## How to read it

- \`events\` is the raw activity log. Each entry has a UTC timestamp (\`ts\`) and a
  \`type\` (see \`manifest.eventTypes\`). Ids (\`prjId\`, \`wflId\`) are bare — resolve them
  to names by joining with \`entities\`.
- \`daily\` is a per-day aggregation (active time, sessions, keystrokes, per-workflow
  time, hourly buckets) computed in \`manifest.timezone\`.
- \`entities\` maps project/workflow/widget ids to their current display names, so the
  log stays meaningful even after something is renamed or deleted.
- \`manifest.fields\` documents every field.

## Suggested prompt for an AI assistant

> Here is my local Freeter usage export (JSON). Using \`entities\` to resolve ids to
> names, summarize how I spend time across workflows, my most active hours, focus vs.
> idle patterns, and any trends across days. Call out anything actionable.
`;

export function buildTelemetryExport({
  events,
  daily,
  entities,
  generatedAt,
  timezone,
}: TelemetryExportInput): TelemetryExportBundle {
  return {
    manifest: {
      app: 'Freeter-SWH',
      schemaVersion: telemetrySchemaVersion,
      generatedAt,
      timezone,
      eventCount: events.length,
      dayCount: daily.length,
      fields: FIELD_DICTIONARY,
      eventTypes: telemetryEventTypeLabels,
      notes: [
        'Local only — never uploaded.',
        'Keystrokes are counted, not captured; keystroke and note contents are never recorded.',
        'Activity events (web_search/page_visit/file_open/todo_done) carry user-facing text in event.text (event.detail = URL/path).',
        'OS-wide events (when enabled): os_window = foreground app (text) + window title (detail) + durationMs; system_event = lock/unlock/suspend/resume.',
        'Times are in milliseconds; event.ts is UTC, daily buckets use manifest.timezone.',
        'Workflow presence (workflow_close.durationMs / daily.perWorkflowMs) counts only while the app is focused.',
      ],
    },
    entities,
    events,
    daily,
    readme: README,
  };
}
