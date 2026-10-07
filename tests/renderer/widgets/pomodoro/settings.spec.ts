/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp, Settings } from '@/widgets/pomodoro/settings';
import { screen } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut'
import { fixtureSettings } from './fixtures';

describe('Pomodoro createSettingsState()', () => {
  it('applies defaults when values are missing', () => {
    const s = createSettingsState({});
    expect(s.workMins).toBe(25);
    expect(s.breakMins).toBe(5);
    expect(s.endSoundVol).toBe(70);
    expect(typeof s.endSound).toBe('string');
  });

  it('keeps valid provided values', () => {
    const s = createSettingsState({ workMins: 50, breakMins: 10, endSoundVol: 30 } as Partial<Settings>);
    expect(s.workMins).toBe(50);
    expect(s.breakMins).toBe(10);
    expect(s.endSoundVol).toBe(30);
  });

  it('falls back to a valid sound when endSound is unknown', () => {
    const s = createSettingsState({ endSound: 'no-such-sound' } as Partial<Settings>);
    expect(s.endSound).not.toBe('no-such-sound');
    expect(typeof s.endSound).toBe('string');
  });
});

describe('Pomodoro Widget Settings', () => {
  beforeEach(() => {
    jest.spyOn(window.Audio.prototype, 'load').mockImplementation(() => { });
    jest.spyOn(window.Audio.prototype, 'pause').mockImplementation(() => { });
  });

  it('should save 0% when "endSoundVol" is set to 0%', async () => {
    const settings = fixtureSettings({ endSoundVol: 70 });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const select = screen.getByRole('combobox', { name: /^End Sound Volume$/i });

    await userEvent.selectOptions(select, '0');
    expect(getSettings()).toEqual({ ...settings, endSoundVol: 0 });
  });
});
