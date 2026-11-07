/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { timerAiActions } from '@/widgets/timer/aiActions';

const [control] = timerAiActions;

describe('timerAiActions', () => {
  it('passes the command to the widget', async () => {
    const fn = jest.fn(() => true);
    await expect(Promise.resolve(control.run({ api: { control: fn }, settings: {} }, { command: 'pause' }))).resolves.toEqual({ ok: true, value: null });
    expect(fn).toHaveBeenCalledWith('pause');
  });

  it('answers failed when the command does not apply now (e.g. resume while running)', async () => {
    await expect(Promise.resolve(control.run({ api: { control: () => false }, settings: {} }, { command: 'resume' }))).resolves.toMatchObject({ code: 'failed' });
  });

  it('parse accepts the four commands only', () => {
    expect(control.parse({ command: 'start' })).toEqual({ command: 'start' });
    expect(control.parse({ command: 'stop' })).toBeUndefined();
  });

  it('describes the command', () => {
    expect(control.describe({ command: 'reset' }, 'Tea', {})).toBe('Reset timer "Tea"');
  });
});
