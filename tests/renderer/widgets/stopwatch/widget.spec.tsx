/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/stopwatch/widget';
import { Settings } from '@/widgets/stopwatch/settings';
import { act, screen } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut';

jest.useFakeTimers();

function setup(optional?: SetupWidgetSutOptional) {
  return setupWidgetSut(widgetComp, {} as Settings, optional);
}

describe('Stopwatch Widget', () => {
  it('starts at 00:00.00 with only a Start button', () => {
    setup();

    expect(screen.getByText('00:00.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });

  it('restores a running stopwatch from dataStorage, counting time passed while away', async () => {
    const getJson = jest.fn(async () => ({ accumulated: 1000, startTs: Date.now() - 2000 }));
    setup({ mockWidgetApi: { dataStorage: { getJson, setJson: jest.fn() } } });

    await act(async () => undefined);
    act(() => jest.advanceTimersByTime(30));

    expect(screen.getByText('00:03.03')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('restores a paused stopwatch and persists state on pause', async () => {
    const setJson = jest.fn();
    const getJson = jest.fn(async () => ({ accumulated: 5000, startTs: null }));
    const { userEvent } = setup({ mockWidgetApi: { dataStorage: { getJson, setJson } } });
    await act(async () => undefined);

    expect(screen.getByText('00:05.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /resume/i }));
    expect(setJson).toHaveBeenLastCalledWith('state', { accumulated: 5000, startTs: Date.now(), laps: [] });
  });

  it('records laps while running and clears them on Reset', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(1230));
    await user.click(screen.getByRole('button', { name: /lap/i }));
    act(() => jest.advanceTimersByTime(1000));
    await user.click(screen.getByRole('button', { name: /lap/i }));

    const laps = screen.getAllByRole('listitem');
    expect(laps.length).toBe(2);
    // newest first: lap #2 delta 1.00s (total 2.23s), lap #1 total 1.23s
    expect(laps[0]).toHaveTextContent('#2');
    expect(laps[0]).toHaveTextContent('00:01.00');
    expect(laps[1]).toHaveTextContent('00:01.23');

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.queryAllByRole('listitem').length).toBe(0);
  });

  it('counts up after Start and shows Pause/Reset', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(1230));

    expect(screen.getByText('00:01.23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('freezes the elapsed time while paused', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(1230));
    await user.click(screen.getByRole('button', { name: /pause/i }));

    act(() => jest.advanceTimersByTime(5000)); // time passes, but we're paused

    expect(screen.getByText('00:01.23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  it('continues from the paused time on Resume', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(1230));
    await user.click(screen.getByRole('button', { name: /pause/i }));
    await user.click(screen.getByRole('button', { name: /resume/i }));
    act(() => jest.advanceTimersByTime(1230)); // multiple of the 30ms tick so the last tick lands exactly

    expect(screen.getByText('00:02.46')).toBeInTheDocument();
  });

  it('resets back to 00:00.00 and the Start button', async () => {
    const { userEvent } = setup();
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /start/i }));
    act(() => jest.advanceTimersByTime(1230));
    await user.click(screen.getByRole('button', { name: /reset/i }));

    expect(screen.getByText('00:00.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
  });
});
