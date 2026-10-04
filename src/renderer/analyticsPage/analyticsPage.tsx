/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { computeDailyRollup } from '@/base/telemetryRollup';
import { formatDuration, summarizeTelemetry } from '@/base/telemetrySummary';
import { buildTelemetryExport } from '@/base/telemetryExport';
import {
  allocateByProject,
  buildWorkBlocks,
  computeFocusStats,
  insightParams,
  previousPeriod,
  ProjectUsage,
  QuickRange,
  quickRange,
  summarizeDayActivity,
  toOsSegments,
} from '@/base/telemetryInsights';
import { TelemetryDay, TelemetryEntitiesSnapshot, toLocalDateStr } from '@common/base/telemetry';
import { useEffect, useMemo, useState } from 'react';
import styles from './analyticsPage.module.scss';

/** Work blocks shorter than this are folded into one "skipped" line in the daily review. */
const MIN_BLOCK_MS = 60_000;
/** Apps / projects listed in the allocation section. */
const TOP_N = 10;

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: '90d', label: '90일' },
  { id: '6m', label: '6개월' },
  { id: '1y', label: '1년' },
];

const SYSTEM_EVENT_LABEL: Record<string, string> = { lock: '잠금', unlock: '잠금 해제', suspend: '절전', resume: '절전 해제' };

interface Loaded {
  /** Days of the selected range plus the equally long period before it (for deltas). */
  days: TelemetryDay[];
  entities: TelemetryEntitiesSnapshot;
}

const today = () => toLocalDateStr(Date.now());

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
}

/** "+12%" / "-5%" vs the previous period; empty when there's nothing to compare against. */
function delta(cur: number, prev: number): string {
  if (prev <= 0) {
    return '';
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

const perHour = (count: number, ms: number) => (ms > 0 ? count / (ms / 3_600_000) : 0);

/** Fetches a same-origin API path. Relative URLs keep the server's access token (the first path segment). */
async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${res.status}`);
  }
  return res.json() as Promise<T>;
}

function Card({ label, value, hint, change }: { label: string; value: string; hint?: string; change?: string }) {
  return (
    <div className={styles['card']} title={hint}>
      <span className={styles['card-label']}>{label}</span>
      <span className={styles['card-value']}>{value}</span>
      <span className={styles['card-delta']}>{change ? `지난 기간 대비 ${change}` : ' '}</span>
    </div>
  );
}

function Bar({ value, max, alt }: { value: number; max: number; alt?: boolean }) {
  return (
    <span className={styles['bar-track']}>
      <span className={`${styles['bar-fill']} ${alt ? styles['bar-fill-alt'] : ''}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </span>
  );
}

function ProjectList({ projects, prev }: { projects: ProjectUsage[]; prev: ProjectUsage[] }) {
  const prevMs = new Map(prev.map(p => [p.prjId, p.ms]));
  const max = projects[0]?.ms ?? 0;
  if (projects.length === 0) {
    return <p className={styles['muted']}>이 기간에 워크플로 사용 기록이 없습니다.</p>;
  }
  return (
    <div className={styles['rows']}>
      {projects.slice(0, TOP_N).map(p => (
        <details key={p.prjId} className={styles['project']}>
          <summary className={styles['row']}>
            <span className={styles['row-label']} title={p.name}>{p.name}</span>
            <Bar value={p.ms} max={max} />
            <span className={styles['row-value']}>{formatDuration(p.ms)}</span>
            <span className={styles['row-delta']}>{delta(p.ms, prevMs.get(p.prjId) ?? 0)}</span>
          </summary>
          {p.workflows.map(w => (
            <div key={w.wflId} className={`${styles['row']} ${styles['row-sub']}`}>
              <span className={styles['row-label']} title={w.name}>{w.name}</span>
              <Bar value={w.ms} max={max} alt />
              <span className={styles['row-value']}>{formatDuration(w.ms)}</span>
              <span className={styles['row-delta']} />
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}

/** One day's review: work blocks with pauses between them, plus what was searched / opened / done. */
function DayReview({ day, entities }: { day: TelemetryDay; entities: TelemetryEntitiesSnapshot }) {
  const { blocks, activity, rollup, focus } = useMemo(() => {
    const segments = toOsSegments(day.events);
    return {
      blocks: buildWorkBlocks(segments),
      activity: summarizeDayActivity(day.events),
      rollup: computeDailyRollup(day.date, day.events),
      focus: computeFocusStats(segments),
    };
  }, [day]);
  const wflName = new Map(entities.workflows.map(w => [w.id, w.name]));
  const workflows = Object.entries(rollup.perWorkflowMs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const shown = blocks.filter(b => b.ms >= MIN_BLOCK_MS);
  const skipped = blocks.length - shown.length;

  return (
    <div className={styles['review']}>
      <p className={styles['review-summary']}>
        컴퓨터 사용 <b>{formatDuration(focus.osMs)}</b> · Freeter 활성 <b>{formatDuration(rollup.activeMs)}</b> ·
        집중 블록 <b>{focus.focusBlocks}개</b>({formatDuration(focus.focusMs)}) · 앱 전환 <b>{focus.switches}회</b>
        {workflows.length > 0 && <> · 워크플로 {workflows.map(([id, ms]) => `${wflName.get(id) ?? '(삭제됨)'} ${formatDuration(ms)}`).join(', ')}</>}
      </p>

      <div className={styles['review-grid']}>
        <div>
          <h4>작업 블록</h4>
          {shown.length === 0 && <p className={styles['muted']}>OS 앱 사용 기록이 없습니다.</p>}
          <ol className={styles['blocks']}>
            {shown.map((b, i) => {
              const prev = shown[i - 1];
              const away = prev && b.start - prev.end > insightParams.gapMs;
              return (
                <li key={b.start}>
                  {away && <div className={styles['away']}>{hhmm(prev.end)} ~ {hhmm(b.start)} 자리 비움 또는 짧은 작업</div>}
                  <div className={`${styles['block']} ${b.ms >= insightParams.focusMinMs ? styles['block-focus'] : ''}`}>
                    <span className={styles['block-time']}>{hhmm(b.start)} ~ {hhmm(b.end)}</span>
                    <span className={styles['block-app']}>{b.app}</span>
                    <span className={styles['block-ms']}>{formatDuration(b.ms)}</span>
                    {b.interruptions > 0 && <span className={styles['block-int']}>끼어듦 {b.interruptions}회</span>}
                    {b.titles.length > 0 && (
                      <span className={styles['block-titles']}>{b.titles.slice(0, 3).map(t => t.title).join(' · ')}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {skipped > 0 && <p className={styles['muted']}>1분 미만 블록 {skipped}개는 생략했습니다.</p>}
        </div>

        <div className={styles['review-side']}>
          {activity.searches.length > 0 && <>
            <h4>검색 ({activity.searches.length})</h4>
            <ul>{activity.searches.map((s, i) => <li key={i}><span className={styles['time']}>{hhmm(s.ts)}</span> {s.text}</li>)}</ul>
          </>}
          {activity.files.length > 0 && <>
            <h4>연 파일 ({activity.files.length})</h4>
            <ul>{activity.files.map((f, i) => <li key={i} title={f.detail}><span className={styles['time']}>{hhmm(f.ts)}</span> {f.text}</li>)}</ul>
          </>}
          {activity.todos.length > 0 && <>
            <h4>완료한 할 일 ({activity.todos.length})</h4>
            <ul>{activity.todos.map((t, i) => <li key={i}><span className={styles['time']}>{hhmm(t.ts)}</span> {t.text}</li>)}</ul>
          </>}
          {activity.pagesByHost.length > 0 && <>
            <h4>방문한 사이트 ({activity.pagesByHost.length})</h4>
            <ul>{activity.pagesByHost.slice(0, 15).map(h => (
              <li key={h.host} title={h.titles.join('\n')}><b>{h.host}</b> <span className={styles['muted']}>{h.count}회</span></li>
            ))}</ul>
          </>}
          {activity.systemEvents.length > 0 && <>
            <h4>시스템</h4>
            <ul>{activity.systemEvents.map((e, i) => (
              <li key={i}><span className={styles['time']}>{hhmm(e.ts)}</span> {SYSTEM_EVENT_LABEL[e.text] ?? e.text}</li>
            ))}</ul>
          </>}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useState(() => quickRange('7d', today()));
  const [quick, setQuick] = useState<QuickRange | null>('7d');
  /** Bumped by Reload / Delete all to refetch the same range. */
  const [reloadTick, setReloadTick] = useState(0);
  /** Outcome of the last finished request, tagged with the request it answers. */
  const [result, setResult] = useState<{ key: string; data?: Loaded; error?: string } | null>(null);
  /** A failed button action (Delete all); cleared by the next load. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState<string | null>(null);

  const rangeValid = range.from <= range.to;
  const prev = useMemo(() => previousPeriod(range.from, range.to), [range]);
  const eventsUrl = `api/events?from=${prev.from}&to=${range.to}`;
  const requestKey = `${eventsUrl}#${reloadTick}`;

  useEffect(() => {
    if (!rangeValid) {
      return undefined;
    }
    // Dropped when the range changes mid-flight, so a slow response can't overwrite a newer one.
    let stale = false;
    Promise.all([
      fetchJson<TelemetryDay[]>(eventsUrl),
      fetchJson<TelemetryEntitiesSnapshot>('api/entities'),
    ]).then(
      ([days, entities]) => {
        if (!stale) {
          setActionError(null);
          setResult({ key: requestKey, data: { days, entities } });
        }
      },
      () => {
        if (!stale) {
          setResult({ key: requestKey, error: 'Freeter에서 데이터를 받지 못했습니다. Freeter가 실행 중인지 확인하고, Freeter 메뉴 View → Analytics로 다시 열어 주세요.' });
        }
      }
    );
    return () => { stale = true; };
  }, [eventsUrl, requestKey, rangeValid]);

  // Derived instead of stored: loading until the result answers the current request.
  const current = result?.key === requestKey ? result : null;
  const loading = rangeValid && !current;
  const data = current?.data ?? null;
  /** A failed load replaces the report; a failed action (actionError) is shown above it instead. */
  const error = current?.error ?? null;
  const reload = () => setReloadTick(t => t + 1);

  const view = useMemo(() => {
    if (!data) {
      return null;
    }
    const cur = data.days.filter(d => d.date >= range.from && d.date <= range.to);
    const before = data.days.filter(d => d.date >= prev.from && d.date <= prev.to);
    const curRollups = cur.map(d => computeDailyRollup(d.date, d.events));
    const prevRollups = before.map(d => computeDailyRollup(d.date, d.events));
    const daily = cur.map((d, i) => ({ date: d.date, rollup: curRollups[i], focus: computeFocusStats(toOsSegments(d.events)) }));
    return {
      cur,
      curRollups,
      daily,
      summary: summarizeTelemetry(curRollups, data.entities, TOP_N),
      prevSummary: summarizeTelemetry(prevRollups, data.entities, TOP_N),
      focus: computeFocusStats(toOsSegments(cur.flatMap(d => d.events))),
      prevFocus: computeFocusStats(toOsSegments(before.flatMap(d => d.events))),
      projects: allocateByProject(curRollups, data.entities),
      prevProjects: allocateByProject(prevRollups, data.entities),
    };
  }, [data, range, prev]);

  const reviewDay = view?.cur.find(d => d.date === reviewDate) ?? view?.cur[view.cur.length - 1];

  const pickQuick = (id: QuickRange) => {
    setQuick(id);
    setRange(quickRange(id, today()));
  };
  const setFrom = (from: string) => { setQuick(null); setRange(r => ({ ...r, from })); };
  const setTo = (to: string) => { setQuick(null); setRange(r => ({ ...r, to })); };

  const onExport = () => {
    if (!view || !data) {
      return;
    }
    const bundle = buildTelemetryExport({
      events: view.cur.flatMap(d => d.events),
      daily: view.curRollups,
      entities: data.entities,
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `freeter-activity-${range.from}_${range.to}.json`;
    a.click();
    // Revoking right after click() can cancel the download in some browsers; give it a moment.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const onDeleteAll = async () => {
    if (!window.confirm('수집된 모든 사용 통계를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }
    try {
      await fetchJson('api/clear', { method: 'POST' });
    } catch {
      setActionError('삭제하지 못했습니다. Freeter가 실행 중인지 확인해 주세요.');
      return;
    }
    reload();
  };

  const s = view?.summary;
  const ps = view?.prevSummary;
  const f = view?.focus;
  const pf = view?.prevFocus;
  const maxDaily = view ? Math.max(0, ...view.daily.map(d => Math.max(d.focus.osMs, d.rollup.activeMs))) : 0;
  const maxHourMs = f ? Math.max(0, ...f.perHourMs) : 0;
  const hourRates = f ? f.perHourMs.map((ms, h) => perHour(f.perHourSwitches[h], ms)) : [];
  const maxRate = Math.max(0, ...hourRates);

  return (
    <div className={styles['page']}>
      <header className={styles['header']}>
        <h1>Freeter Analytics</h1>
        <div className={styles['controls']}>
          <div className={styles['quick']} role="group" aria-label="빠른 기간 선택">
            {QUICK_RANGES.map(q => (
              <button key={q.id} type="button" aria-pressed={quick === q.id} onClick={() => pickQuick(q.id)}>{q.label}</button>
            ))}
          </div>
          <label>From <input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
          <label>To <input type="date" value={range.to} min={range.from} max={today()} onChange={e => e.target.value && setTo(e.target.value)} /></label>
          <span className={styles['spacer']} />
          <button type="button" onClick={reload}>새로고침</button>
          <button type="button" onClick={onExport} disabled={!view}>Export…</button>
          <button type="button" className={styles['danger']} onClick={onDeleteAll}>Delete all</button>
        </div>
        {!rangeValid && <p className={styles['error']}>From 날짜가 To 날짜보다 늦습니다.</p>}
      </header>

      {actionError && <p className={styles['error']}>{actionError}</p>}
      {error && <p className={styles['error']}>{error}</p>}
      {loading && !error && <p className={styles['muted']}>불러오는 중…</p>}

      {!loading && !error && view && view.cur.length === 0 && (
        <p className={styles['muted']}>선택한 기간에 수집된 데이터가 없습니다.</p>
      )}

      {!loading && !error && view && s && ps && f && pf && view.cur.length > 0 && (
        <main>
          <section>
            <h2>개요 <span className={styles['muted']}>{range.from} ~ {range.to} · 지난 기간 {prev.from} ~ {prev.to}</span></h2>
            <div className={styles['cards']}>
              <Card label="컴퓨터 사용 시간" hint="컴퓨터 전체에서 앱이 앞에 있던 시간. 3분 넘게 입력이 없거나 잠긴 뒤의 시간은 빠지지만, Windows가 Idle·LockApp으로 보고한 구간은 포함" value={formatDuration(f.osMs)} change={delta(f.osMs, pf.osMs)} />
              <Card label="Freeter 활성 시간" hint="Freeter 창이 앞에 있고 입력이 있던 시간" value={formatDuration(s.totalActiveMs)} change={delta(s.totalActiveMs, ps.totalActiveMs)} />
              <Card label="집중 시간" hint={`${insightParams.focusMinMs / 60_000}분 이상 이어진 작업 블록의 합`} value={formatDuration(f.focusMs)} change={delta(f.focusMs, pf.focusMs)} />
              <Card label="최장 작업 블록" hint="한 앱에서 이어진 가장 긴 작업 블록 (짧은 끼어듦 포함)" value={formatDuration(f.longestBlockMs)} change={delta(f.longestBlockMs, pf.longestBlockMs)} />
              <Card label="시간당 앱 전환" hint="낮을수록 덜 쪼개진 하루" value={perHour(f.switches, f.osMs).toFixed(1)}
                change={delta(perHour(f.switches, f.osMs), perHour(pf.switches, pf.osMs))} />
              <Card label="키 입력 (Freeter)" value={s.totalKeystrokes.toLocaleString()} change={delta(s.totalKeystrokes, ps.totalKeystrokes)} />
            </div>
          </section>

          <section>
            <h2>일별 <span className={styles['muted']}>날짜를 누르면 아래 하루 회고로 이동</span></h2>
            <div className={styles['legend']}>
              <span><i className={styles['bar-fill']} />컴퓨터 사용</span>
              <span><i className={`${styles['bar-fill']} ${styles['bar-fill-alt']}`} />Freeter 활성</span>
            </div>
            <div className={styles['rows']}>
              {[...view.daily].reverse().map(d => (
                <div key={d.date} className={styles['row']}>
                  <a className={styles['row-label']} href="#review" onClick={() => setReviewDate(d.date)}>{d.date}</a>
                  <span className={styles['dual']}>
                    <Bar value={d.focus.osMs} max={maxDaily} />
                    <Bar value={d.rollup.activeMs} max={maxDaily} alt />
                  </span>
                  <span className={styles['row-value']}>{formatDuration(d.focus.osMs)} / {formatDuration(d.rollup.activeMs)}</span>
                  <span className={styles['row-delta']}>집중 {formatDuration(d.focus.focusMs)} · 전환 {perHour(d.focus.switches, d.focus.osMs).toFixed(0)}/h</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>집중·방해 패턴</h2>
            <div className={styles['heatmap']} aria-label="시간대별 사용 시간과 전환 빈도">
              <span className={styles['heat-head']}>사용</span>
              {f.perHourMs.map((ms, h) => (
                <span key={h} className={styles['heat-cell']} title={`${h}시 · ${formatDuration(ms)}`}
                  style={{ opacity: maxHourMs > 0 ? 0.08 + 0.92 * (ms / maxHourMs) : 0.08 }} />
              ))}
              <span className={styles['heat-head']}>전환</span>
              {hourRates.map((rate, h) => (
                <span key={h} className={`${styles['heat-cell']} ${styles['heat-cell-alt']}`} title={`${h}시 · 시간당 ${rate.toFixed(1)}회 전환`}
                  style={{ opacity: maxRate > 0 ? 0.08 + 0.92 * (rate / maxRate) : 0.08 }} />
              ))}
              <span />
              {f.perHourMs.map((_, h) => <span key={h} className={styles['heat-label']}>{h % 3 === 0 ? h : ''}</span>)}
            </div>
            <div className={styles['facts']}>
              <p>
                10초 미만으로 머문 창이 전체의 <b>{f.segments > 0 ? Math.round((f.shortSegments / f.segments) * 100) : 0}%</b>입니다.
                집중 블록 <b>{f.focusBlocks}개</b>, 평균 {f.focusBlocks > 0 ? formatDuration(f.focusMs / f.focusBlocks) : '0m'}.
              </p>
              {f.interrupters.length > 0 && (
                <p>
                  1분 안에 다녀간 앱(끼어듦): {f.interrupters.map(i => `${i.app} ${i.count}회`).join(', ')}
                </p>
              )}
            </div>
          </section>

          <section>
            <h2>배분</h2>
            <div className={styles['two-col']}>
              <div>
                <h3>프로젝트·워크플로 <span className={styles['muted']}>Freeter에서 머문 시간, 펼쳐서 워크플로 보기</span></h3>
                <ProjectList projects={view.projects} prev={view.prevProjects} />
              </div>
              <div>
                <h3>앱 <span className={styles['muted']}>컴퓨터 전체</span></h3>
                {s.topApps.length === 0
                  ? <p className={styles['muted']}>OS 앱 사용 기록이 없습니다.</p>
                  : (
                    <div className={styles['rows']}>
                      {s.topApps.map(a => (
                        <div key={a.name} className={styles['row']}>
                          <span className={styles['row-label']} title={a.name}>{a.name}</span>
                          <Bar value={a.ms} max={s.topApps[0].ms} />
                          <span className={styles['row-value']}>{formatDuration(a.ms)}</span>
                          <span className={styles['row-delta']}>{delta(a.ms, ps.topApps.find(x => x.name === a.name)?.ms ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </section>

          <section id="review">
            <h2>
              하루 회고{' '}
              <select aria-label="회고할 날짜" value={reviewDay?.date} onChange={e => setReviewDate(e.target.value)}>
                {[...view.cur].reverse().map(d => <option key={d.date} value={d.date}>{d.date}</option>)}
              </select>
            </h2>
            {reviewDay && data && <DayReview day={reviewDay} entities={data.entities} />}
          </section>
        </main>
      )}

      <footer className={styles['muted']}>
        모든 데이터는 이 컴퓨터에만 있습니다. 새로고침하면 저장된 기록을 다시 읽습니다. Freeter 안의 활동은 최대 15초 늦게 저장되고, 지금 앞에 있는 앱
        (이 브라우저 포함)의 시간은 다른 앱으로 전환해야 기록됩니다. 프로젝트·워크플로 이름은 Freeter 메뉴에서 다시 열 때 갱신됩니다.
      </footer>
    </div>
  );
}
