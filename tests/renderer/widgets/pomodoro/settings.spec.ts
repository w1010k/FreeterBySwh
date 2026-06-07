/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, Settings } from '@/widgets/pomodoro/settings';

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
