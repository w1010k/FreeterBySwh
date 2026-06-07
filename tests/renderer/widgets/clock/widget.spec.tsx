/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/clock/widget';
import { Settings } from '@/widgets/clock/settings';
import { formatClock } from '@/widgets/clock/clock';
import { screen } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';

jest.useFakeTimers();
const NOW = new Date('2026-01-01T13:05:09Z');
beforeEach(() => jest.setSystemTime(NOW));
afterAll(() => jest.useRealTimers());

function setup(s: Partial<Settings>) {
  return setupWidgetSut(widgetComp, { entries: [], hour12: false, showSeconds: false, showDate: false, ...s } as Settings);
}

describe('Clock Widget', () => {
  it('shows the time and label for a clock entry', () => {
    setup({ entries: [{ id: '1', label: 'UTC', timeZone: 'UTC' }] });

    // Compare against the same formatter the widget uses (system locale).
    const expected = formatClock(NOW, { timeZone: 'UTC', hour12: false, showSeconds: false, showDate: false }).time;
    expect(screen.getByText('UTC')).toBeInTheDocument();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders multiple clocks (world clock)', () => {
    setup({ entries: [
      { id: '1', label: 'Seoul', timeZone: 'Asia/Seoul' },
      { id: '2', label: 'New York', timeZone: 'America/New_York' },
    ]});

    expect(screen.getByText('Seoul')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();
  });

  it('shows a date line when showDate is on', () => {
    setup({ entries: [{ id: '1', label: 'UTC', timeZone: 'UTC' }], showDate: true });

    const date = formatClock(NOW, { timeZone: 'UTC', hour12: false, showSeconds: false, showDate: true }).date as string;
    expect(screen.getByText(date)).toBeInTheDocument();
  });
});
