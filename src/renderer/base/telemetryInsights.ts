/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Pure derivations behind the browser Analytics page: focus / interruption
 * patterns from OS foreground segments, time allocation per project, a per-day
 * activity digest for the daily review, and local-date range helpers. Everything
 * is computed on read from the unchanged raw event log.
 */

import { DailyRollup, TelemetryEntitiesSnapshot, TelemetryEvent, toLocalDateStr } from '@common/base/telemetry';

/** Heuristic thresholds. Tuned by feel, not measured; kept in one place to adjust. */
export const insightParams = {
  /** A different-app run shorter than this, between two runs of the same app, is an interruption, not a new task. */
  absorbMs: 60_000,
  /** A pause longer than this (idle / lock / Freeter not running) ends a work block. */
  gapMs: 5 * 60_000,
  /** A work block at least this long counts as focused work. */
  focusMinMs: 25 * 60_000,
  /** Segments shorter than this count toward the "very short switch" ratio. */
  shortSegmentMs: 10_000,
};

export type InsightParams = typeof insightParams;

/** A foreground OS app/window segment reconstructed from an os_window event. */
export interface OsSegment {
  start: number;
  end: number;
  app: string;
  title: string;
}

/**
 * os_window is emitted when a segment ends, so ts is its end and start = ts - durationMs.
 * ponytail: an idle-closed segment is emitted up to the idle threshold (~3 min) after it
 * really ended, so its placement drifts by that much; fine at block/hour granularity.
 */
export function toOsSegments(events: readonly TelemetryEvent[]): OsSegment[] {
  return events
    .filter(e => e.type === 'os_window' && (e.durationMs ?? 0) > 0)
    .map(e => ({ start: e.ts - (e.durationMs ?? 0), end: e.ts, app: e.text || 'Unknown', title: e.detail ?? '' }))
    .sort((a, b) => a.start - b.start);
}

/** A stretch of work in one app, with brief detours into other apps folded in. */
export interface WorkBlock {
  start: number;
  end: number;
  app: string;
  /** Foreground time inside the block, absorbed interruptions included, pauses excluded. */
  ms: number;
  /** Brief other-app detours folded into this block. */
  interruptions: number;
  /** The block's own window titles by time spent, descending (top 5). */
  titles: { title: string; ms: number }[];
}

interface Run {
  start: number;
  end: number;
  app: string;
  ms: number;
  interruptions: number;
  titles: Map<string, number>;
}

function addTitle(titles: Map<string, number>, title: string, ms: number) {
  titles.set(title, (titles.get(title) ?? 0) + ms);
}

/**
 * Groups segments into work blocks: consecutive same-app segments join, and a
 * brief detour away from an app and back (A · B · A, or through several apps
 * A · B · C · A) collapses into one A block with one interruption counted.
 */
export function buildWorkBlocks(segments: readonly OsSegment[], p: InsightParams = insightParams): WorkBlock[] {
  const stack: Run[] = [];
  for (const s of segments) {
    const dur = s.end - s.start;
    const top = stack[stack.length - 1];
    if (top && top.app === s.app && s.start - top.end <= p.gapMs) {
      top.end = Math.max(top.end, s.end);
      top.ms += dur;
      addTitle(top.titles, s.title, dur);
    } else {
      stack.push({ start: s.start, end: s.end, app: s.app, ms: dur, interruptions: 0, titles: new Map([[s.title, dur]]) });
    }
    // Walk back over the runs since the last visit to this app; fold them in if
    // together they were brief and unbroken by a long pause.
    const c = stack[stack.length - 1];
    let detourMs = 0;
    for (let i = stack.length - 2; i >= 0; i--) {
      const r = stack[i];
      if (stack[i + 1].start - r.end > p.gapMs) {
        break;
      }
      if (r.app === c.app) {
        if (i < stack.length - 2) {
          // The detour counts once and its titles are dropped: the block describes the main task.
          const titles = new Map(r.titles);
          c.titles.forEach((ms, title) => addTitle(titles, title, ms));
          stack.splice(i, stack.length - i, {
            start: r.start,
            end: c.end,
            app: r.app,
            ms: r.ms + detourMs + c.ms,
            interruptions: r.interruptions + 1 + c.interruptions,
            titles,
          });
        }
        break;
      }
      detourMs += r.ms;
      if (detourMs >= p.absorbMs) {
        break;
      }
    }
  }
  return stack.map(r => ({
    start: r.start,
    end: r.end,
    app: r.app,
    ms: r.ms,
    interruptions: r.interruptions,
    titles: [...r.titles.entries()]
      .filter(([title]) => title)
      .map(([title, ms]) => ({ title, ms }))
      .sort((x, y) => y.ms - x.ms)
      .slice(0, 5),
  }));
}

export interface FocusStats {
  /** OS foreground time. */
  osMs: number;
  /** App changes between consecutive segments (changes across a long pause don't count). */
  switches: number;
  segments: number;
  /** Segments shorter than shortSegmentMs. */
  shortSegments: number;
  /** Time in work blocks of at least focusMinMs. */
  focusMs: number;
  focusBlocks: number;
  longestBlockMs: number;
  /** OS foreground ms by local hour-of-day (length 24). */
  perHourMs: number[];
  /** App switches by local hour-of-day (length 24). */
  perHourSwitches: number[];
  /** Apps most often switched into for less than absorbMs, descending (top 5). */
  interrupters: { app: string; count: number }[];
}

/** Adds [start, end) to local hour-of-day buckets, splitting at hour boundaries. */
function addByHour(perHour: number[], start: number, end: number) {
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    const until = Math.min(end, nextHour);
    perHour[d.getHours()] += until - t;
    t = until;
  }
}

/** Focus / interruption metrics over chronologically sorted segments (may span days). */
export function computeFocusStats(segments: readonly OsSegment[], p: InsightParams = insightParams): FocusStats {
  const perHourMs = new Array<number>(24).fill(0);
  const perHourSwitches = new Array<number>(24).fill(0);
  const interrupters = new Map<string, number>();
  let osMs = 0;
  let switches = 0;
  let shortSegments = 0;

  segments.forEach((s, i) => {
    const dur = s.end - s.start;
    osMs += dur;
    addByHour(perHourMs, s.start, s.end);
    if (dur < p.shortSegmentMs) {
      shortSegments += 1;
    }
    const prev = segments[i - 1];
    if (prev && prev.app !== s.app && s.start - prev.end <= p.gapMs) {
      switches += 1;
      perHourSwitches[new Date(s.start).getHours()] += 1;
      if (dur < p.absorbMs) {
        interrupters.set(s.app, (interrupters.get(s.app) ?? 0) + 1);
      }
    }
  });

  const blocks = buildWorkBlocks(segments, p);
  const focused = blocks.filter(b => b.ms >= p.focusMinMs);

  return {
    osMs,
    switches,
    segments: segments.length,
    shortSegments,
    focusMs: focused.reduce((sum, b) => sum + b.ms, 0),
    focusBlocks: focused.length,
    longestBlockMs: blocks.reduce((max, b) => Math.max(max, b.ms), 0),
    perHourMs,
    perHourSwitches,
    interrupters: [...interrupters.entries()]
      .map(([app, count]) => ({ app, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

export interface ProjectUsage {
  /** '' for time on workflows that no longer exist. */
  prjId: string;
  name: string;
  ms: number;
  workflows: { wflId: string; name: string; ms: number }[];
}

/**
 * Workflow presence time (focused time in Freeter per workflow) grouped by
 * project, descending. Uses rollup.perWorkflowMs only: the wflId on os_window
 * events is just whatever workflow Freeter had selected while another app was
 * in front, so it would misattribute OS time.
 */
export function allocateByProject(rollups: readonly DailyRollup[], entities: TelemetryEntitiesSnapshot): ProjectUsage[] {
  const wflById = new Map(entities.workflows.map(w => [w.id, w]));
  const prjName = new Map(entities.projects.map(p => [p.id, p.name]));
  const perWfl = new Map<string, number>();
  for (const r of rollups) {
    for (const [wflId, ms] of Object.entries(r.perWorkflowMs)) {
      perWfl.set(wflId, (perWfl.get(wflId) ?? 0) + ms);
    }
  }

  const projects = new Map<string, ProjectUsage>();
  for (const [wflId, ms] of perWfl) {
    const wfl = wflById.get(wflId);
    const prjId = wfl && prjName.has(wfl.prjId) ? wfl.prjId : '';
    let prj = projects.get(prjId);
    if (!prj) {
      prj = { prjId, name: prjId ? prjName.get(prjId) ?? '' : '(삭제된 워크플로)', ms: 0, workflows: [] };
      projects.set(prjId, prj);
    }
    prj.ms += ms;
    prj.workflows.push({ wflId, name: wfl?.name || `(삭제됨: ${wflId.slice(0, 8)})`, ms });
  }

  const list = [...projects.values()];
  list.forEach(p => p.workflows.sort((a, b) => b.ms - a.ms));
  return list.sort((a, b) => b.ms - a.ms);
}

export interface DayActivity {
  searches: { ts: number; text: string }[];
  files: { ts: number; text: string; detail?: string }[];
  todos: { ts: number; text: string }[];
  /** lock / unlock / suspend / resume. */
  systemEvents: { ts: number; text: string }[];
  /** Page visits grouped by host (SPA URL hops would otherwise flood the list), most visited first. */
  pagesByHost: { host: string; count: number; titles: string[] }[];
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).host || url : '(unknown)';
  } catch {
    return url || '(unknown)';
  }
}

/** The semantic "what did I do" events of one day, digested for the daily review. */
export function summarizeDayActivity(events: readonly TelemetryEvent[]): DayActivity {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const hosts = new Map<string, { count: number; titles: Set<string> }>();
  for (const e of sorted) {
    if (e.type === 'page_visit') {
      const host = hostOf(e.detail);
      const h = hosts.get(host) ?? { count: 0, titles: new Set<string>() };
      h.count += 1;
      if (e.text && h.titles.size < 5) {
        h.titles.add(e.text);
      }
      hosts.set(host, h);
    }
  }
  return {
    searches: sorted.filter(e => e.type === 'web_search').map(e => ({ ts: e.ts, text: e.text ?? '' })),
    files: sorted.filter(e => e.type === 'file_open').map(e => ({ ts: e.ts, text: e.text ?? '', ...(e.detail ? { detail: e.detail } : {}) })),
    todos: sorted.filter(e => e.type === 'todo_done').map(e => ({ ts: e.ts, text: e.text ?? '' })),
    systemEvents: sorted.filter(e => e.type === 'system_event').map(e => ({ ts: e.ts, text: e.text ?? '' })),
    pagesByHost: [...hosts.entries()]
      .map(([host, h]) => ({ host, count: h.count, titles: [...h.titles] }))
      .sort((a, b) => b.count - a.count),
  };
}

// --- local-date range helpers ('YYYY-MM-DD', the user's timezone) ---

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d.getTime());
}

/** Same day-of-month N months away, clamped to the month's last day (Aug 31 - 6 months → Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const d = parseDate(date);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toLocalDateStr(target.getTime());
}

/** Inclusive day count of [from, to]. Rounded so DST days don't skew it. */
export function dayCount(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000) + 1;
}

export type QuickRange = '7d' | '30d' | '90d' | '6m' | '1y';

/** The quick-button range ending today, inclusive of both ends. */
export function quickRange(kind: QuickRange, today: string): { from: string; to: string } {
  const from: Record<QuickRange, () => string> = {
    '7d': () => addDays(today, -6),
    '30d': () => addDays(today, -29),
    '90d': () => addDays(today, -89),
    '6m': () => addDays(addMonths(today, -6), 1),
    '1y': () => addDays(addMonths(today, -12), 1),
  };
  return { from: from[kind](), to: today };
}

/** The equally long period right before [from, to], for "vs previous period" deltas. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const n = dayCount(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
}
