/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { clampShelfPopupBox } from '@/ui/components/topBar/shelf/shelfItemViewModel';

describe('clampShelfPopupBox', () => {
  const topPx = 46;

  it('should keep an in-bounds box unchanged', () => {
    expect(clampShelfPopupBox(100, 300, 150, 1000, 800, topPx)).toEqual({ leftPx: 100, wPx: 300, hPx: 150 });
  });

  it('should shift the left edge so the box stays within the window width', () => {
    // box at left=900 with width 300 would end at 1200 > 1000 → shift left to 700
    expect(clampShelfPopupBox(900, 300, 150, 1000, 800, topPx)).toEqual({ leftPx: 700, wPx: 300, hPx: 150 });
  });

  it('should clamp width to the window and pin the box to the left when wider than the window', () => {
    const box = clampShelfPopupBox(100, 1200, 150, 1000, 800, topPx);
    expect(box.wPx).toBe(1000);
    expect(box.leftPx).toBe(0);
  });

  it('should clamp height to the space below the popup top offset', () => {
    // window height 500, top offset 46 → max height 454
    expect(clampShelfPopupBox(100, 300, 900, 1000, 500, topPx).hPx).toBe(454);
  });

  it('should never produce a negative height when the window is shorter than the top offset', () => {
    expect(clampShelfPopupBox(100, 300, 150, 1000, 30, topPx).hPx).toBe(0);
  });
});
