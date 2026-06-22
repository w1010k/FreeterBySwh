/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetContextMenuFactory, WidgetMenuItem } from '@/widgets/appModules';

export const labelClearHistory = 'Clear recent searches';

/**
 * Adds a "Clear recent searches" item to the widget's context menu, shown only
 * while there is history to clear. `getHasHistory` is read at menu-open time so
 * the item reflects the live history without re-registering the factory.
 */
export function createContextMenuFactory(
  getHasHistory: () => boolean,
  clearHistory: () => void
): WidgetContextMenuFactory {
  return () => {
    const items: WidgetMenuItem[] = [];
    if (getHasHistory()) {
      items.push({
        label: labelClearHistory,
        doAction: async () => clearHistory(),
      });
    }
    return items;
  };
}
