/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Entity } from '@/base/entity';
import { addEntityToList, EntityList, findEntityIndexOnList, findEntityOnList } from '@/base/entityList';

export interface WidgetListItem extends Entity {
  readonly widgetId: string;
  // Size (px) of this widget's popup box when shown from the Top Bar shelf.
  // Optional: undefined falls back to the default popup size.
  readonly w?: number;
  readonly h?: number;
}
export type WidgetList = EntityList<WidgetListItem>;

export function createList(): WidgetList {
  return [];
}

interface ListItemProps {
  readonly id: string;
  readonly widgetId: string;
  readonly w?: number;
  readonly h?: number;
}

export function createListItem(
  list: WidgetList,
  props: ListItemProps,
  itemTargetId: string | null
): [list: WidgetList, listItem: WidgetListItem | null] {
  const { id, widgetId, w, h } = props;

  const sameIdItem = findEntityOnList(list, id);
  if (sameIdItem) {
    return [list, null];
  }

  let toIdx = itemTargetId === null ? -1 : findEntityIndexOnList(list, itemTargetId);
  if (toIdx < 0) {
    toIdx = list.length;
  }

  const newItem: WidgetListItem = {
    id,
    widgetId,
    ...(typeof w === 'number' ? { w } : {}),
    ...(typeof h === 'number' ? { h } : {})
  }

  const newList = addEntityToList(list, newItem, toIdx);

  return [newList, newItem];
}
