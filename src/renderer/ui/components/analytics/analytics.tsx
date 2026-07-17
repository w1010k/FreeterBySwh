/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AnalyticsViewModelHook } from '@/ui/components/analytics/analyticsViewModel';
import { ModalScreen } from '@/ui/components/basic/modalScreen';
import { formatDuration } from '@/base/telemetrySummary';
import { TelemetryEventType } from '@common/base/telemetry';
import styles from './analytics.module.scss';

type Deps = {
  useAnalyticsViewModel: AnalyticsViewModelHook;
}

const HOUR_LABELS = ['0', '', '', '3', '', '', '6', '', '', '9', '', '', '12', '', '', '15', '', '', '18', '', '', '21', '', ''];

const ACTIVITY_LABEL: Partial<Record<TelemetryEventType, string>> = {
  web_search: '검색',
  page_visit: '방문',
  file_open: '파일',
  todo_done: '완료',
  os_window: '앱',
  system_event: '시스템',
};

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles['card']}>
      <span className={styles['card-value']}>{value}</span>
      <span className={styles['card-label']}>{label}</span>
    </div>
  )
}

export function createAnalyticsComponent({
  useAnalyticsViewModel,
}: Deps) {
  function Analytics() {
    const { loading, summary, timeline, error, range, onRangeChange, reload, onCloseClick, onExportClick, onClearClick } = useAnalyticsViewModel();

    const hasData = !!summary && summary.dayCount > 0;
    const maxDay = hasData ? Math.max(1, ...summary.dailyActive.map(d => d.activeMs)) : 1;
    const maxWfl = hasData && summary.topWorkflows.length > 0 ? Math.max(1, ...summary.topWorkflows.map(w => w.ms)) : 1;
    const maxApp = hasData && summary.topApps.length > 0 ? Math.max(1, ...summary.topApps.map(a => a.ms)) : 1;
    const maxHour = hasData ? Math.max(1, ...summary.perHour) : 1;

    return (
      <ModalScreen
        buttons={[
          { id: 'export', caption: 'Export…', onClick: () => onExportClick() },
          { id: 'clear', caption: 'Delete all', onClick: () => onClearClick() },
          { id: 'reload', caption: 'Reload', onClick: () => reload() },
          { id: 'close', caption: 'Close', primary: true, onClick: onCloseClick },
        ]}
        title="Analytics"
      >
        <div className={styles['analytics']}>
          <div className={styles['range-row']}>
            <label>
              기간{' '}
              <select aria-label="기간" value={range} onChange={e => onRangeChange(e.target.value as typeof range)}>
                <option value="all">전체</option>
                <option value="30">최근 30일</option>
                <option value="7">최근 7일</option>
              </select>
            </label>
          </div>

          {loading && <p className={styles['msg']}>불러오는 중…</p>}

          {!loading && error && <p className={styles['msg']}>통계를 불러오지 못했습니다: {error}</p>}

          {!loading && !error && !hasData && (
            range !== 'all'
              // Data may exist outside the narrowed range — don't tell the user to enable collection.
              ? <p className={styles['msg']}>선택한 기간에 수집된 데이터가 없습니다.</p>
              : <div className={styles['msg']}>
                  <p>아직 수집된 사용 데이터가 없습니다.</p>
                  <p>설정 → <b>Usage analytics (local only)</b>를 켜면 이 화면에서 사용 통계를 볼 수 있어요.
                     모든 데이터는 이 컴퓨터에만 저장됩니다.</p>
                </div>
          )}

          {!loading && !error && hasData && summary && (
            <>
              <div className={styles['cards']}>
                <Card label="총 활성 시간" value={formatDuration(summary.totalActiveMs)} />
                <Card label="세션 수" value={`${summary.totalSessions}`} />
                <Card label="키 입력 수" value={summary.totalKeystrokes.toLocaleString()} />
                <Card label="활성 타이핑 시간" value={formatDuration(summary.totalTypingMs)} />
                <Card label="기록된 일수" value={`${summary.dayCount}일`} />
              </div>

              <section className={styles['section']}>
                <h3>활동 타임라인 — 무엇을 했나</h3>
                {timeline.length === 0
                  ? <p className={styles['muted']}>기록된 활동이 없습니다. (검색·페이지 방문·파일 열기·할일 완료가 여기에 쌓입니다.)</p>
                  : (
                    <div className={styles['timeline']}>
                      {timeline.map(day => (
                        <div key={day.date} className={styles['timeline-day']}>
                          <div className={styles['timeline-date']}>{day.date}</div>
                          {day.entries.map((e, i) => (
                            <div key={`${e.ts}-${i}`} className={styles['timeline-entry']} title={e.detail}>
                              <span className={styles['timeline-time']}>{e.time}</span>
                              <span className={styles['timeline-kind']}>{ACTIVITY_LABEL[e.type] ?? e.type}</span>
                              <span className={styles['timeline-text']}>{e.text || e.detail}</span>
                              {e.workflowName && <span className={styles['timeline-wfl']}>{e.workflowName}</span>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
              </section>

              <section className={styles['section']}>
                <h3>일별 활성 시간</h3>
                <div className={styles['bars']}>
                  {summary.dailyActive.map(d => (
                    <div key={d.date} className={styles['bar-row']}>
                      <span className={styles['bar-label']}>{d.date}</span>
                      <span className={styles['bar-track']}>
                        <span className={styles['bar-fill']} style={{ width: `${(d.activeMs / maxDay) * 100}%` }} />
                      </span>
                      <span className={styles['bar-value']}>{formatDuration(d.activeMs)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles['section']}>
                <h3>워크플로별 사용 시간 (Top {summary.topWorkflows.length})</h3>
                {summary.topWorkflows.length === 0
                  ? <p className={styles['muted']}>워크플로 사용 데이터가 없습니다.</p>
                  : (
                    <div className={styles['bars']}>
                      {summary.topWorkflows.map(w => (
                        <div key={w.wflId} className={styles['bar-row']}>
                          <span className={styles['bar-label']} title={w.name}>{w.name}</span>
                          <span className={styles['bar-track']}>
                            <span className={styles['bar-fill']} style={{ width: `${(w.ms / maxWfl) * 100}%` }} />
                          </span>
                          <span className={styles['bar-value']}>{formatDuration(w.ms)}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </section>

              {summary.topApps.length > 0 && <section className={styles['section']}>
                <h3>앱별 사용 시간 (Top {summary.topApps.length})</h3>
                <div className={styles['bars']}>
                  {summary.topApps.map(a => (
                    <div key={a.name} className={styles['bar-row']}>
                      <span className={styles['bar-label']} title={a.name}>{a.name}</span>
                      <span className={styles['bar-track']}>
                        <span className={styles['bar-fill']} style={{ width: `${(a.ms / maxApp) * 100}%` }} />
                      </span>
                      <span className={styles['bar-value']}>{formatDuration(a.ms)}</span>
                    </div>
                  ))}
                </div>
              </section>}

              <section className={styles['section']}>
                <h3>시간대별 활동</h3>
                <div className={styles['heatmap']}>
                  {summary.perHour.map((ms, h) => (
                    <div key={h} className={styles['heat-col']} title={`${h}시 · ${formatDuration(ms)}`}>
                      <span className={styles['heat-bar']} style={{ height: `${(ms / maxHour) * 100}%` }} />
                      <span className={styles['heat-label']}>{HOUR_LABELS[h]}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </ModalScreen>
    )
  }

  return Analytics;
}

export type AnalyticsComponent = ReturnType<typeof createAnalyticsComponent>;
