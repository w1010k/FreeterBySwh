/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/pomodoro/widget';
import { Settings } from '@/widgets/pomodoro/settings';
import { act, screen } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut';
import { fixtureSettings } from './fixtures';

jest.useFakeTimers();

function setup(settings?: Partial<Settings>, optional?: SetupWidgetSutOptional) {
  return setupWidgetSut(widgetComp, fixtureSettings(settings ?? {}), optional);
}

describe('Pomodoro Widget', () => {
  it('shows the work duration and a Start button when idle', () => {
    setup({ workMins: 25 });

    expect(screen.getByText('25:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('restores a running break phase and the session count from dataStorage', async () => {
    const getJson = jest.fn(async () => ({ phase: 'break', endMsecs: Date.now() + 120500, pausedLeft: null, doneWork: 3 }));
    setup({}, { mockWidgetApi: { dataStorage: { getJson, setJson: jest.fn() } } });

    await act(async () => undefined);

    expect(screen.getByText('Break')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
    expect(screen.getByText('🍅 3')).toBeInTheDocument();
  });

  it('restores as idle (keeping the session count) when the saved phase already expired', async () => {
    const getJson = jest.fn(async () => ({ phase: 'work', endMsecs: Date.now() - 1000, pausedLeft: null, doneWork: 2 }));
    setup({ workMins: 25 }, { mockWidgetApi: { dataStorage: { getJson, setJson: jest.fn() } } });

    await act(async () => undefined);

    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
    expect(screen.getByText('🍅 2')).toBeInTheDocument();
  });

  it('persists the state when it changes', async () => {
    const setJson = jest.fn();
    const { userEvent } = setup({ workMins: 25 }, {
      mockWidgetApi: { dataStorage: { getJson: jest.fn(async () => undefined), setJson } }
    });
    await act(async () => undefined);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));

    const last = setJson.mock.calls[setJson.mock.calls.length - 1];
    expect(last[0]).toBe('state');
    expect(last[1].phase).toBe('work');
    expect(last[1].endMsecs).toBeGreaterThan(Date.now());
  });

  it('rolls into a long break after every Nth completed work session', async () => {
    const { userEvent } = setup({ workMins: 25, breakMins: 5, longBreakMins: 15, longBreakEvery: 1 });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(25 * 60000 + 1000));

    expect(screen.getByText('Long Break')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
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
