/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Local-only usage telemetry data model. Shared between main and renderer.
 *
 * Privacy contract:
 * - Collected only when the user opts in (appConfig.telemetry.enabled).
 * - Keystrokes are counted, never captured (no raw key content).
 * - Activity-timeline events DO record meaningful context the user asked for —
 *   search terms, visited page titles/URLs, opened file paths, completed to-dos.
 *   Note contents are intentionally NOT recorded.
 * - Stored locally under <appData>/freeter-data/telemetry, never sent anywhere.
 */

/** Bump on any breaking change to TelemetryEvent / DailyRollup shapes. */
export const telemetrySchemaVersion = 1;

export type TelemetryEventType =
  // app window entered the foreground
  | 'app_focus'
  // app window left the foreground (carries durationMs = focused wall-clock)
  | 'app_blur'
  // a workflow became the current one (while focused)
  | 'workflow_open'
  // the user left a workflow / app blurred (durationMs = focused presence)
  | 'workflow_close'
  // the current project changed
  | 'project_switch'
  // a closed active (non-idle) interval; durationMs + keystroke count
  | 'activity_tick'
  // --- activity timeline (semantic context) ---
  // a search performed in a Web Query widget (text = query)
  | 'web_search'
  // a page navigated to in a Webpage widget (text = title, detail = url)
  | 'page_visit'
  // a file opened via File Explorer / File Opener (text = name, detail = path)
  | 'file_open'
  // a to-do item marked complete (text = item text)
  | 'todo_done'
  // --- OS-wide activity (when enabled) ---
  // a foreground app/window segment that just ended (text = app, detail = title, durationMs = time on it)
  | 'os_window'
  // a system power/session event (text = 'lock'|'unlock'|'suspend'|'resume')
  | 'system_event';

/** The subset of event types widgets may log via widgetApi.logActivity. */
export type TelemetryActivityType = 'web_search' | 'page_visit' | 'file_open' | 'todo_done';

/** Payload a widget supplies when logging an activity (never includes ids). */
export interface TelemetryActivityPayload {
  /** Primary label: query / page title / file name / to-do text. */
  text?: string;
  /** Secondary detail: page URL / full file path. */
  detail?: string;
}

/** Activity-timeline event types — the semantic "what did I do" events. */
export const telemetryActivityEventTypes: readonly TelemetryEventType[] = ['web_search', 'page_visit', 'file_open', 'todo_done', 'os_window', 'system_event'];

export function isTelemetryActivityEvent(type: TelemetryEventType): boolean {
  return telemetryActivityEventTypes.includes(type);
}

export interface TelemetryEvent {
  /** Epoch milliseconds (UTC). */
  readonly ts: number;
  readonly type: TelemetryEventType;
  /** Identifier only — resolved to a display name at export time. */
  readonly prjId?: string;
  readonly wflId?: string;
  readonly widgetId?: string;
  /** Length of the closed interval (ms): app_blur, workflow_close, activity_tick. */
  readonly durationMs?: number;
  /** Keystrokes during the interval (activity_tick) — count only, never content. */
  readonly count?: number;
  /** Primary label for activity events (query / page title / file name / to-do text / app name). */
  readonly text?: string;
  /** Secondary detail for activity events (e.g. page URL, full file path, window title). */
  readonly detail?: string;
}

export interface DailyRollup {
  /** 'YYYY-MM-DD' in the user's local timezone. */
  readonly date: string;
  /** App-foreground, non-idle time summed over the day. */
  readonly activeMs: number;
  readonly sessionCount: number;
  /** Total keystrokes that day (count only). */
  readonly keystrokeCount: number;
  /** Active time during which keystrokes occurred. */
  readonly typingActiveMs: number;
  /** Time spent per workflow id (ms). */
  readonly perWorkflowMs: Record<string, number>;
  /** Time spent per foreground OS app (ms), from os_window events. */
  readonly perAppMs: Record<string, number>;
  /** Length 24: activeMs bucketed by hour-of-day (local). */
  readonly perHour: number[];
}

/** Human/AI-readable label for each event type — embedded in export manifest. */
export const telemetryEventTypeLabels: Record<TelemetryEventType, string> = {
  app_focus: 'App window entered the foreground',
  app_blur: 'App window left the foreground (durationMs = focused wall-clock time)',
  workflow_open: 'A workflow became the current one',
  workflow_close: 'The user left a workflow (durationMs = focused presence time)',
  project_switch: 'The current project changed',
  activity_tick: 'A closed active interval (durationMs); count = keystrokes in it (no content)',
  web_search: 'A search performed in a Web Query widget (text = query)',
  page_visit: 'A page navigated to in a Webpage widget (text = title, detail = url)',
  file_open: 'A file opened via File Explorer / File Opener (text = name, detail = path)',
  todo_done: 'A to-do item marked complete (text = item text)',
  os_window: 'A foreground OS app/window segment that ended (text = app, detail = window title, durationMs = time on it)',
  system_event: 'A system power/session event (text = lock|unlock|suspend|resume)',
};

/**
 * Local 'YYYY-MM-DD' for an epoch-ms timestamp. Pure given a Date impl; events
 * are bucketed into days by the user's local timezone (matches what they see).
 */
export function toLocalDateStr(ts: number, dateCtor: (ms: number) => Date = (ms) => new Date(ms)): string {
  const d = dateCtor(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Storage key for a day's raw event log. */
export const telemetryEventsKeyPrefix = 'events-';
export const telemetryEventsKey = (date: string) => `${telemetryEventsKeyPrefix}${date}`;

/**
 * Snapshot of entity id→name at export/read time, so a consumer (a human, or an
 * AI) can resolve the bare ids in the event log to meaningful names even after
 * the project/workflow has been renamed or deleted.
 */
export interface TelemetryEntitiesSnapshot {
  projects: { id: string; name: string }[];
  workflows: { id: string; name: string; prjId: string }[];
  widgets: { id: string; type: string; name: string }[];
}
