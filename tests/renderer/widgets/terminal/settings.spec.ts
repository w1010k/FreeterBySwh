/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp } from '@/widgets/terminal/settings';
import { screen, waitFor } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut'

describe('Terminal Widget Settings', () => {
  it('fills missing or wrong-typed values with empty strings (the defaults)', () => {
    expect(createSettingsState({})).toEqual({ shell: '', cwd: '', startCommand: '' });
    expect(createSettingsState({ shell: 3, cwd: 'C:/w', startCommand: null } as never)).toEqual({ shell: '', cwd: 'C:/w', startCommand: '' });
  });

  it('edits the start command', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, createSettingsState({}));
    const input = screen.getByRole('textbox', { name: /start command/i });
    userEvent.type(input, 'claude');
    await waitFor(() => expect(input).toHaveValue('claude'));
    expect(getSettings()).toMatchObject({ startCommand: 'claude' });
  });
});
