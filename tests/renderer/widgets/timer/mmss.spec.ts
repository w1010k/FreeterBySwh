/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { msecsToMMSS } from '@/widgets/timer/mmss';

describe('msecsToMMSS()', () => {
  it('formats minutes and seconds, rounding down', () => {
    expect(msecsToMMSS(25 * 60000)).toBe('25:00');
    expect(msecsToMMSS(61999)).toBe('01:01');
  })

  it('clamps a time past the end to 00:00', () => {
    expect(msecsToMMSS(-300)).toBe('00:00');
  })
})
