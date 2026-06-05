/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EntityId } from '@/base/entity';
import { WidgetList } from '@/base/widgetList';

export function deleteWidgetsFromWidgetListSubCase(
  widgetIdsToDel: EntityId[],
  widgetList: WidgetList,
): [newList: WidgetList, deletedIds: EntityId[]] {
  const idsToDel = new Set(widgetIdsToDel);
  const delWidgetIds: EntityId[] = [];
  const newList = widgetList.filter(item => {
    if (idsToDel.has(item.widgetId)) {
      delWidgetIds.push(item.widgetId);
      return false;
    }
    return true;
  })
  return [newList, delWidgetIds];
}
