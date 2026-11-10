/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp } from '@/widgets/terminal/settings';
import { screen, waitFor } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut'

describe('Terminal Widget Settings', () => {
  it('fills missing or wrong-typed values with empty strings (the defaults)', () => {
    expect(createSettingsState({})).toEqual({ shell: '', cwd: '', startCommand: '', fontSize: 13 });
    expect(createSettingsState({ shell: 3, cwd: 'C:/w', startCommand: null } as never)).toEqual({ shell: '', cwd: 'C:/w', startCommand: '', fontSize: 13 });
  });

  it('keeps the font size a whole number from 6 to 48', () => {
    expect(createSettingsState({ fontSize: 15 }).fontSize).toBe(15);
    expect(createSettingsState({ fontSize: 2 }).fontSize).toBe(6);
    expect(createSettingsState({ fontSize: 100 }).fontSize).toBe(48);
    expect(createSettingsState({ fontSize: 14.6 }).fontSize).toBe(15);
    expect(createSettingsState({ fontSize: 'big' } as never).fontSize).toBe(13);
  });

  it('takes a two-digit font size typed key by key (no clamp while typing), and keeps the size in range on leaving', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, createSettingsState({}));
    const input = screen.getByRole('spinbutton', { name: /font size/i });
    userEvent.clear(input);
    userEvent.type(input, '20');
    await waitFor(() => expect(getSettings()).toMatchObject({ fontSize: 20 }));
    expect(input).toHaveValue(20);
    userEvent.clear(input);
    userEvent.type(input, '99');
    userEvent.tab();
    await waitFor(() => expect(input).toHaveValue(20)); // out of range: the size stays
    expect(getSettings()).toMatchObject({ fontSize: 20 });
  });

  it('edits the start command', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, createSettingsState({}));
    const input = screen.getByRole('textbox', { name: /start command/i });
    userEvent.type(input, 'claude');
    await waitFor(() => expect(input).toHaveValue('claude'));
    expect(getSettings()).toMatchObject({ startCommand: 'claude' });
  });
});
