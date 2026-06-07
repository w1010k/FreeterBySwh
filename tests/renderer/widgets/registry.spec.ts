/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import widgetTypes from '@/widgets';
import { createUiState } from '@/base/state/ui';

describe('widget registry', () => {
  it('has unique widget type ids', () => {
    const ids = widgetTypes.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists every registered widget type in the default palette', () => {
    // Guards the bug where a new widget was registered but forgotten in the
    // hardcoded default palette list (ui.ts), so it never showed in "Add Widget".
    const paletteIds = createUiState().palette.widgetTypeIds;
    const missing = widgetTypes.map(w => w.id).filter(id => !paletteIds.includes(id));
    expect(missing).toEqual([]);
  });
});
