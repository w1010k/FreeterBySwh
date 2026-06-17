/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DailyRollup, TelemetryEntitiesSnapshot } from '@common/base/telemetry';

export interface WorkflowUsage {
  wflId: string;
  name: string;
  ms: number;
}

export interface AppUsage {
  name: string;
  ms: number;
}

export interface TelemetrySummary {
  totalActiveMs: number;
  totalTypingMs: number;
  totalKeystrokes: number;
  totalSessions: number;
  dayCount: number;
  /** Per-day active time, sorted by date ascending. */
  dailyActive: { date: string; activeMs: number }[];
  /** Top workflows by presence time, descending. */
  topWorkflows: WorkflowUsage[];
  /** Top OS apps by foreground time, descending. */
  topApps: AppUsage[];
  /** Active time bucketed by hour-of-day (length 24). */
  perHour: number[];
}

const DEFAULT_TOP_N = 8;

export function summarizeTelemetry(
  rollups: readonly DailyRollup[],
  entities: TelemetryEntitiesSnapshot,
  topN: number = DEFAULT_TOP_N
): TelemetrySummary {
  const nameById = new Map(entities.workflows.map(w => [w.id, w.name]));

  let totalActiveMs = 0;
  let totalTypingMs = 0;
  let totalKeystrokes = 0;
  let totalSessions = 0;
  const perHour = new Array<number>(24).fill(0);
  const perWorkflow = new Map<string, number>();
  const perApp = new Map<string, number>();
  const dailyActive: { date: string; activeMs: number }[] = [];

  for (const r of rollups) {
    totalActiveMs += r.activeMs;
    totalTypingMs += r.typingActiveMs;
    totalKeystrokes += r.keystrokeCount;
    totalSessions += r.sessionCount;
    dailyActive.push({ date: r.date, activeMs: r.activeMs });
    for (let h = 0; h < 24; h++) {
      perHour[h] += r.perHour[h] ?? 0;
    }
    for (const [wflId, ms] of Object.entries(r.perWorkflowMs)) {
      perWorkflow.set(wflId, (perWorkflow.get(wflId) ?? 0) + ms);
    }
    for (const [app, ms] of Object.entries(r.perAppMs ?? {})) {
      perApp.set(app, (perApp.get(app) ?? 0) + ms);
    }
  }

  dailyActive.sort((a, b) => a.date.localeCompare(b.date));

  const topWorkflows: WorkflowUsage[] = [...perWorkflow.entries()]
    .map(([wflId, ms]) => ({
      wflId,
      ms,
      name: nameById.get(wflId) || `(삭제됨: ${wflId.slice(0, 8)})`,
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topN);

  const topApps: AppUsage[] = [...perApp.entries()]
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topN);

  return {
    totalActiveMs,
    totalTypingMs,
    totalKeystrokes,
    totalSessions,
    dayCount: rollups.length,
    dailyActive,
    topWorkflows,
    topApps,
    perHour,
  };
}

/** Compact human duration, e.g. 90061000 → "1d 1h", 4500000 → "1h 15m". */
export function formatDuration(ms: number): string {
  if (ms <= 0) {
    return '0m';
  }
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) {
    return `${d}d ${h}h`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}
