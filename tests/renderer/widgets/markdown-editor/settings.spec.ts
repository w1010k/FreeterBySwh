/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp } from '@/widgets/markdown-editor/settings';
import { screen, waitFor } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut';

describe('Markdown Editor Widget Settings', () => {
  it('should default a missing or invalid folder to an empty string', () => {
    expect(createSettingsState({})).toEqual({ folder: '' });
    expect(createSettingsState({ folder: 3 } as never)).toEqual({ folder: '' });
    expect(createSettingsState({ folder: '/docs' })).toEqual({ folder: '/docs' });
  })

  it('should set the folder from the folder picker', async () => {
    const showOpenDirDialog = jest.fn(async () => ({ canceled: false, filePaths: ['/picked'] }));
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, { folder: '' }, { mockSettingsApi: { dialog: { showOpenDirDialog } } });

    await userEvent.click(screen.getByRole('button', { name: /select folder/i }));

    await waitFor(() => expect(getSettings()).toEqual({ folder: '/picked' }));
  })
})
