/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/pomodoro/widget';
import { Settings } from '@/widgets/pomodoro/settings';
import { act, screen } from '@testing-library/react';
import { setupWidgetSut } from '@tests/widgets/setupSut';
import { fixtureSettings } from './fixtures';

jest.useFakeTimers();

function setup(settings?: Partial<Settings>) {
  return setupWidgetSut(widgetComp, fixtureSettings(settings ?? {}));
}

describe('Pomodoro Widget', () => {
  it('shows the work duration and a Start button when idle', () => {
    setup({ workMins: 25 });

    expect(screen.getByText('25:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('counts down the work phase after Start', async () => {
    const { userEvent } = setup({ workMins: 25 });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(5000));

    expect(screen.getByText('24:55')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('switches to the break phase and counts a completed work session when work ends', async () => {
    const { userEvent } = setup({ workMins: 1, breakMins: 5 });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(61000)); // past the 1-minute work phase

    expect(screen.getByText('Break')).toBeInTheDocument();
    expect(screen.getByText('05:00')).toBeInTheDocument();
    expect(screen.getByText('🍅 1')).toBeInTheDocument();
  });

  it('pauses and resumes, keeping the remaining time', async () => {
    const { userEvent } = setup({ workMins: 25 });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(5000));
    await user.click(screen.getByRole('button', { name: /pause/i }));
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByText('24:55')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resume/i }));
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText('24:50')).toBeInTheDocument();
  });
});
