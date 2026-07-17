/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAnalyticsComponent } from '@/ui/components/analytics/analytics';
import { AnalyticsViewModel } from '@/ui/components/analytics/analyticsViewModel';
import { TelemetrySummary } from '@/base/telemetrySummary';

const summary: TelemetrySummary = {
  totalActiveMs: 3_600_000,
  totalTypingMs: 600_000,
  totalKeystrokes: 1234,
  totalSessions: 5,
  dayCount: 2,
  dailyActive: [{ date: '2026-06-17', activeMs: 3_600_000 }],
  topWorkflows: [{ wflId: 'w1', name: 'Dev', ms: 3_600_000 }],
  topApps: [{ name: 'Code', ms: 3_600_000 }],
  perHour: new Array<number>(24).fill(0),
};

function setup(vm: Partial<AnalyticsViewModel>) {
  const viewModel: AnalyticsViewModel = {
    loading: false,
    summary: null,
    timeline: [],
    error: null,
    range: 'all',
    onRangeChange: jest.fn(),
    reload: jest.fn(),
    onCloseClick: jest.fn(),
    onExportClick: jest.fn(),
    onClearClick: jest.fn(),
    ...vm,
  };
  const Analytics = createAnalyticsComponent({ useAnalyticsViewModel: () => viewModel });
  render(<Analytics />);
  return viewModel;
}

describe('Analytics component', () => {
  it('shows a loading message while loading', () => {
    setup({ loading: true });
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
  });

  it('shows the consent hint when there is no data', () => {
    setup({ loading: false, summary: { ...summary, dayCount: 0 } });
    expect(screen.getByText(/아직 수집된 사용 데이터가 없습니다/)).toBeInTheDocument();
  });

  it('shows a range-specific empty message (not the consent hint) when a narrowed range has no data', () => {
    setup({ loading: false, summary: { ...summary, dayCount: 0 }, range: '7' });
    expect(screen.getByText(/선택한 기간에 수집된 데이터가 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 수집된 사용 데이터가 없습니다/)).not.toBeInTheDocument();
  });

  it('shows an error message on failure', () => {
    setup({ error: 'boom' });
    expect(screen.getByText(/통계를 불러오지 못했습니다: boom/)).toBeInTheDocument();
  });

  it('renders summary cards, top workflows and the activity timeline', () => {
    setup({
      summary,
      timeline: [{
        date: '2026-06-17',
        entries: [
          { ts: 2, time: '10:30', type: 'web_search', text: 'rust traits', workflowName: 'Dev' },
          { ts: 1, time: '09:00', type: 'file_open', text: 'a.ts', detail: '/x/a.ts' },
        ],
      }],
    });

    expect(screen.getByText('총 활성 시간')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument(); // keystrokes
    expect(screen.getAllByText('Dev').length).toBeGreaterThan(0); // top workflow + timeline
    expect(screen.getByText('rust traits')).toBeInTheDocument(); // timeline entry
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('10:30')).toBeInTheDocument();
  });

  it('wires the header buttons to the view-model handlers', async () => {
    const user = userEvent.setup();
    const vm = setup({ summary, timeline: [] });

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('button', { name: /delete all/i }));
    await user.click(screen.getByRole('button', { name: /reload/i }));
    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(vm.onExportClick).toHaveBeenCalledTimes(1);
    expect(vm.onClearClick).toHaveBeenCalledTimes(1);
    expect(vm.reload).toHaveBeenCalledTimes(1);
    expect(vm.onCloseClick).toHaveBeenCalledTimes(1);
  });
})
