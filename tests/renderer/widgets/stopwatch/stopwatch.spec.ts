/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { formatStopwatch } from '@/widgets/stopwatch/stopwatch';

describe('formatStopwatch', () => {
  it('formats zero', () => {
    expect(formatStopwatch(0)).toBe('00:00.00');
  });

  it('formats sub-minute times with centiseconds', () => {
    expect(formatStopwatch(1230)).toBe('00:01.23');
    expect(formatStopwatch(9990)).toBe('00:09.99');
  });

  it('formats minutes and seconds', () => {
    expect(formatStopwatch(83045)).toBe('01:23.04');
  });

  it('adds an hours field once past an hour', () => {
    expect(formatStopwatch(3661230)).toBe('1:01:01.23');
  });

  it('floors to centiseconds and clamps negatives to zero', () => {
    expect(formatStopwatch(1239)).toBe('00:01.23'); // floored, not rounded
    expect(formatStopwatch(-500)).toBe('00:00.00');
  });
});
