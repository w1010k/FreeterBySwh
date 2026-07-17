/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/pomodoro/settings';

export function fixtureSettings(settings: Partial<Settings>): Settings {
  return {
    workMins: 25,
    breakMins: 5,
    longBreakMins: 15,
    longBreakEvery: 0,
    endSound: '', // no sound in tests
    endSoundVol: 70,
    ...settings
  }
}
