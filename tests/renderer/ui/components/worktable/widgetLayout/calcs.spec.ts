/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { itemXDeltaPxToUnits, itemYDeltaPxToUnits } from '@/ui/components/worktable/widgetLayout/calcs';

describe('item delta px to units', () => {
  // One step = 100px column + 4px gap; the half-step is 52px in both directions.
  it('snaps growing and shrinking at the same distance', () => {
    expect(itemXDeltaPxToUnits(51, 100)).toBe(0);
    expect(Math.abs(itemXDeltaPxToUnits(-51, 100))).toBe(0);
    expect(itemXDeltaPxToUnits(53, 100)).toBe(1);
    expect(itemXDeltaPxToUnits(-53, 100)).toBe(-1);
    expect(itemYDeltaPxToUnits(-53 - 104, 100)).toBe(-2);
  });
});
