/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EntityId } from '@/base/entity';
import { WidgetLayout } from '@/base/widgetLayout';

export function deleteWidgetsFromWidgetLayoutSubCase(
  widgetIds: EntityId[],
  layout: WidgetLayout,
): [newLayout: WidgetLayout, deletedIds: EntityId[]] {
  const idsToDel = new Set(widgetIds);
  const delWidgetIds: EntityId[] = [];
  const newLayout = layout.filter(item => {
    if (idsToDel.has(item.widgetId)) {
      delWidgetIds.push(item.widgetId);
      return false;
    }
    return true;
  })
  return [newLayout, delWidgetIds];
}
