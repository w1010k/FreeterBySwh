/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/d-day/widget';
import { Settings } from '@/widgets/d-day/settings';
import { screen } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';

jest.useFakeTimers();
beforeEach(() => jest.setSystemTime(new Date(2026, 0, 1, 9, 0, 0)));
afterAll(() => jest.useRealTimers());

function setup(settings: Partial<Settings>) {
  return setupWidgetSut(widgetComp, { showDate: false, entries: [], ...settings });
}

describe('D-Day Widget', () => {
  it('shows D-N, D-DAY and D+N for future, today and past dates', () => {
    setup({ entries: [
      { id: '1', label: 'Exam', date: '2026-01-11' },
      { id: '2', label: 'NewYear', date: '2026-01-01' },
      { id: '3', label: 'Anniv', date: '2025-12-22' },
    ]});

    expect(screen.getByText('Exam')).toBeInTheDocument();
    expect(screen.getByText('D-10')).toBeInTheDocument();
    expect(screen.getByText('D-DAY')).toBeInTheDocument();
    expect(screen.getByText('D+10')).toBeInTheDocument();
  });

  it('shows a placeholder when the date is unset', () => {
    setup({ entries: [{ id: '1', label: 'No date', date: '' }] });

    expect(screen.getByText('No date')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows "(No label)" when the label is empty', () => {
    setup({ entries: [{ id: '1', label: '', date: '2026-01-11' }] });

    expect(screen.getByText('(No label)')).toBeInTheDocument();
    expect(screen.getByText('D-10')).toBeInTheDocument();
  });

  it('shows the date with weekday under the count when showDate is on', () => {
    setup({ showDate: true, entries: [{ id: '1', label: 'Exam', date: '2026-07-07' }] });

    const wd = new Date(2026, 6, 7).toLocaleDateString(undefined, { weekday: 'short' });
    expect(screen.getByText(`2026-07-07 (${wd})`)).toBeInTheDocument();
  });

  it('does not show the date line when showDate is off', () => {
    setup({ showDate: false, entries: [{ id: '1', label: 'Exam', date: '2026-07-07' }] });

    expect(screen.queryByText(/^2026-07-07/)).not.toBeInTheDocument();
  });
});
