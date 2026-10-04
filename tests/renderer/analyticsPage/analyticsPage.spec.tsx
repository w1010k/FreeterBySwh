/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnalyticsPage } from '@/analyticsPage/analyticsPage';
import { addDays, previousPeriod } from '@/base/telemetryInsights';
import { TelemetryDay, toLocalDateStr } from '@common/base/telemetry';

const MIN = 60_000;
const now = new Date();
const today = toLocalDateStr(now.getTime());
const at = (h: number, m = 0, s = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s).getTime();

const days: TelemetryDay[] = [{
  date: today,
  events: [
    { ts: at(9, 30), type: 'os_window', text: 'Code', detail: 'main.ts', durationMs: 30 * MIN },
    { ts: at(9, 30, 20), type: 'os_window', text: 'Slack', durationMs: 20_000 },
    { ts: at(9, 40, 20), type: 'os_window', text: 'Code', detail: 'main.ts', durationMs: 10 * MIN },
    { ts: at(9, 5), type: 'web_search', text: 'react useMemo' },
  ],
}];

function setup() {
  const fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.startsWith('api/entities') ? { projects: [], workflows: [], widgets: [] } : days),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  render(<AnalyticsPage />);
  return { fetchMock };
}

describe('AnalyticsPage', () => {
  it('loads the last 7 days plus the previous period and renders the report from it', async () => {
    const { fetchMock } = setup();

    expect(await screen.findByText('컴퓨터 사용 시간')).toBeInTheDocument();
    const prev = previousPeriod(addDays(today, -6), today);
    expect(fetchMock).toHaveBeenCalledWith(`api/events?from=${prev.from}&to=${today}`, undefined);
    // 30m + a 20s Slack detour + 10m folds into one focused Code block.
    expect(screen.getAllByText('40m').length).toBeGreaterThan(0);
    expect(screen.getByText('끼어듦 1회')).toBeInTheDocument();
    expect(screen.getByText(/react useMemo/)).toBeInTheDocument();
  });

  it('refetches for a quick range', async () => {
    const { fetchMock } = setup();
    await screen.findByText('컴퓨터 사용 시간');

    fireEvent.click(screen.getByRole('button', { name: '30일' }));

    const prev = previousPeriod(addDays(today, -29), today);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`api/events?from=${prev.from}&to=${today}`, undefined));
  });

  it('Delete all asks first, then clears and refetches the same range', async () => {
    const { fetchMock } = setup();
    await screen.findByText('컴퓨터 사용 시간');
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(fetchMock).not.toHaveBeenCalledWith('api/clear', expect.anything());

    const eventsCalls = () => fetchMock.mock.calls.filter(([url]) => url.startsWith('api/events')).length;
    const before = eventsCalls();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('api/clear', { method: 'POST' }));
    await waitFor(() => expect(eventsCalls()).toBe(before + 1));
    expect(await screen.findByText('컴퓨터 사용 시간')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('keeps the report on screen when Delete all fails', async () => {
    const { fetchMock } = setup();
    await screen.findByText('컴퓨터 사용 시간');
    const ok = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) => (url === 'api/clear' ? { ok: false, json: async () => days } : ok(url)));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));

    expect(await screen.findByText(/삭제하지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByText('컴퓨터 사용 시간')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('tells the user to reopen from Freeter when the server is gone', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    render(<AnalyticsPage />);

    expect(await screen.findByText(/Freeter가 실행 중인지 확인/)).toBeInTheDocument();
  });
});
