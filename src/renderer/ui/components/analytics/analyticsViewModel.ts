/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CloseAnalyticsUseCase } from '@/application/useCases/analytics/closeAnalytics';
import { GetTelemetryEntitiesUseCase } from '@/application/useCases/telemetry/getTelemetryEntities';
import { ReadTelemetryEventsUseCase } from '@/application/useCases/telemetry/readTelemetryEvents';
import { ExportTelemetryDataUseCase } from '@/application/useCases/telemetry/exportTelemetryData';
import { ClearTelemetryDataUseCase } from '@/application/useCases/telemetry/clearTelemetryData';
import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { computeDailyRollup } from '@/base/telemetryRollup';
import { summarizeTelemetry, TelemetrySummary } from '@/base/telemetrySummary';
import { buildActivityTimeline, TimelineDay } from '@/base/telemetryTimeline';
import { useCallback, useEffect, useRef, useState } from 'react';

type Deps = {
  closeAnalyticsUseCase: CloseAnalyticsUseCase;
  getTelemetryEntitiesUseCase: GetTelemetryEntitiesUseCase;
  readTelemetryEventsUseCase: ReadTelemetryEventsUseCase;
  exportTelemetryDataUseCase: ExportTelemetryDataUseCase;
  clearTelemetryDataUseCase: ClearTelemetryDataUseCase;
  dialogProvider: DialogProvider;
}

interface State {
  loading: boolean;
  summary: TelemetrySummary | null;
  timeline: TimelineDay[];
  error: string | null;
}

export function createAnalyticsViewModelHook({
  closeAnalyticsUseCase,
  getTelemetryEntitiesUseCase,
  readTelemetryEventsUseCase,
  exportTelemetryDataUseCase,
  clearTelemetryDataUseCase,
  dialogProvider,
}: Deps) {
  function useViewModel() {
    const [state, setState] = useState<State>({ loading: true, summary: null, timeline: [], error: null });
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
      setState({ loading: true, summary: null, timeline: [], error: null });
      try {
        // Read the raw day files once and derive both rollups and the timeline
        // locally — avoids reading + parsing every history file twice per open.
        const days = await readTelemetryEventsUseCase();
        const entities = getTelemetryEntitiesUseCase();
        const rollups = days.map(({ date, events }) => computeDailyRollup(date, events));
        if (!mountedRef.current) {
          return;
        }
        setState({
          loading: false,
          summary: summarizeTelemetry(rollups, entities),
          timeline: buildActivityTimeline(days, entities),
          error: null,
        });
      } catch (e) {
        if (!mountedRef.current) {
          return;
        }
        setState({ loading: false, summary: null, timeline: [], error: e instanceof Error ? e.message : String(e) });
      }
    }, []);

    useEffect(() => {
      mountedRef.current = true;
      load();
      return () => { mountedRef.current = false; };
    }, [load]);

    const onCloseClick = useCallback(() => {
      closeAnalyticsUseCase();
    }, []);

    const onExportClick = useCallback(async () => {
      const res = await exportTelemetryDataUseCase();
      if (res.status === 'error') {
        await dialogProvider.showMessageBox({ type: 'warning', message: '내보내기에 실패했습니다.' });
      } else if (res.status === 'saved') {
        await dialogProvider.showMessageBox({ type: 'info', message: `내보냈습니다:\n${res.filePath}` });
      }
    }, []);

    const onClearClick = useCallback(async () => {
      const res = await dialogProvider.showMessageBox({
        type: 'warning',
        message: '수집된 모든 사용 통계를 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
        buttons: ['삭제', '취소'],
        defaultId: 1,
        cancelId: 1,
      });
      if (res.response === 0) {
        await clearTelemetryDataUseCase();
        await load();
      }
    }, [load]);

    return {
      loading: state.loading,
      summary: state.summary,
      timeline: state.timeline,
      error: state.error,
      reload: load,
      onCloseClick,
      onExportClick,
      onClearClick,
    }
  }

  return useViewModel;
}

export type AnalyticsViewModelHook = ReturnType<typeof createAnalyticsViewModelHook>;
export type AnalyticsViewModel = ReturnType<AnalyticsViewModelHook>;
