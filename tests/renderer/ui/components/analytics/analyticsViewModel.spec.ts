/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createAnalyticsViewModelHook } from '@/ui/components/analytics/analyticsViewModel';
import { mockDialogProvider } from '@tests/infra/mocks/dialogProvider';
import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';
import { TelemetryDay } from '@/application/useCases/telemetry/readTelemetryEvents';

const entities: TelemetryEntitiesSnapshot = {
  projects: [],
  workflows: [{ id: 'w1', name: 'Dev', prjId: 'p1' }],
  widgets: [],
};
const days: TelemetryDay[] = [{
  date: '2026-06-17',
  events: [
    { ts: 1, type: 'app_focus' },
    { ts: 2, type: 'activity_tick', durationMs: 1000, count: 3 },
    { ts: 3, type: 'workflow_close', wflId: 'w1', durationMs: 800 },
    { ts: 4, type: 'web_search', text: 'hello', wflId: 'w1' },
  ],
}];

function setup(over?: { exportResult?: 'saved' | 'canceled' | 'error'; confirmClear?: boolean }) {
  const closeAnalyticsUseCase = jest.fn();
  const getTelemetryEntitiesUseCase = jest.fn(() => entities);
  const flushTelemetryUseCase = jest.fn(async () => undefined);
  const readTelemetryEventsUseCase = jest.fn(async () => days);
  const exportTelemetryDataUseCase = jest.fn(async () =>
    over?.exportResult === 'canceled' ? { status: 'canceled' as const }
      : over?.exportResult === 'error' ? { status: 'error' as const }
        : { status: 'saved' as const, filePath: '/out/x.json' });
  const clearTelemetryDataUseCase = jest.fn(async () => undefined);
  const dialogProvider = mockDialogProvider({
    showMessageBox: jest.fn(async () => ({ response: over?.confirmClear ? 0 : 1, checkboxChecked: false })),
  });
  const useViewModel = createAnalyticsViewModelHook({
    closeAnalyticsUseCase, getTelemetryEntitiesUseCase, flushTelemetryUseCase,
    readTelemetryEventsUseCase, exportTelemetryDataUseCase, clearTelemetryDataUseCase, dialogProvider,
  });
  return {
    useViewModel, closeAnalyticsUseCase, exportTelemetryDataUseCase,
    clearTelemetryDataUseCase, readTelemetryEventsUseCase, flushTelemetryUseCase, dialogProvider,
  };
}

describe('analyticsViewModel', () => {
  it('loads rollups + timeline on mount and exposes a summary', async () => {
    const { useViewModel } = setup();
    const { result } = renderHook(() => useViewModel());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary?.totalActiveMs).toBe(1000);
    expect(result.current.summary?.topWorkflows[0]).toMatchObject({ name: 'Dev', ms: 800 });
    expect(result.current.timeline[0].entries[0]).toMatchObject({ type: 'web_search', text: 'hello', workflowName: 'Dev' });
  });

  it('flushes buffered events before reading so just-recorded activity shows', async () => {
    const { useViewModel, flushTelemetryUseCase, readTelemetryEventsUseCase } = setup();
    const { result } = renderHook(() => useViewModel());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(flushTelemetryUseCase).toHaveBeenCalled();
    // flush resolved before the read ran
    expect(flushTelemetryUseCase.mock.invocationCallOrder[0])
      .toBeLessThan(readTelemetryEventsUseCase.mock.invocationCallOrder[0]);
  });

  it('re-reads with a fromDate when the range changes, and without one for "all"', async () => {
    const { useViewModel, readTelemetryEventsUseCase } = setup();
    const { result } = renderHook(() => useViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // initial load: full history
    expect(readTelemetryEventsUseCase).toHaveBeenLastCalledWith(undefined);

    act(() => result.current.onRangeChange('7'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const lastCall = readTelemetryEventsUseCase.mock.calls[readTelemetryEventsUseCase.mock.calls.length - 1] as unknown as [string?];
    expect(lastCall[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 7-day range starts 6 days ago
    const expected = new Date();
    expected.setDate(expected.getDate() - 6);
    expect(lastCall[0]).toBe(
      `${expected.getFullYear()}-${`${expected.getMonth() + 1}`.padStart(2, '0')}-${`${expected.getDate()}`.padStart(2, '0')}`
    );
  });

  it('onCloseClick closes the screen', async () => {
    const { useViewModel, closeAnalyticsUseCase } = setup();
    const { result } = renderHook(() => useViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.onCloseClick());

    expect(closeAnalyticsUseCase).toHaveBeenCalledTimes(1);
  });

  it('onExportClick exports and shows a success message when saved', async () => {
    const { useViewModel, exportTelemetryDataUseCase, dialogProvider } = setup({ exportResult: 'saved' });
    const { result } = renderHook(() => useViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.onExportClick(); });

    expect(exportTelemetryDataUseCase).toHaveBeenCalledTimes(1);
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('onClearClick clears and reloads only after the user confirms', async () => {
    const { useViewModel, clearTelemetryDataUseCase, readTelemetryEventsUseCase } = setup({ confirmClear: true });
    const { result } = renderHook(() => useViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const readsBefore = readTelemetryEventsUseCase.mock.calls.length;

    await act(async () => { await result.current.onClearClick(); });

    expect(clearTelemetryDataUseCase).toHaveBeenCalledTimes(1);
    expect(readTelemetryEventsUseCase.mock.calls.length).toBeGreaterThan(readsBefore); // reloaded
  });

  it('onClearClick does nothing when the user cancels the confirm dialog', async () => {
    const { useViewModel, clearTelemetryDataUseCase } = setup({ confirmClear: false });
    const { result } = renderHook(() => useViewModel());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.onClearClick(); });

    expect(clearTelemetryDataUseCase).not.toHaveBeenCalled();
  });

  it('surfaces an error when loading fails', async () => {
    const broken = createAnalyticsViewModelHook({
      closeAnalyticsUseCase: jest.fn(),
      getTelemetryEntitiesUseCase: jest.fn(() => entities),
      flushTelemetryUseCase: jest.fn(async () => undefined),
      readTelemetryEventsUseCase: jest.fn(async () => { throw new Error('boom'); }),
      exportTelemetryDataUseCase: jest.fn(),
      clearTelemetryDataUseCase: jest.fn(),
      dialogProvider: mockDialogProvider({}),
    });
    const { result } = renderHook(() => broken());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
})
