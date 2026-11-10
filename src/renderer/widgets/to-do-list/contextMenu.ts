/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { GetToDoListState, SetActiveItemEditorState, SetToDoListState } from '@/widgets/to-do-list/state';
import { deleteCompleted, deleteItem, activateItemEditor, labelAddItemTop, labelDeleteCompleted, labelDeleteItem, labelEditItem, labelMarkAllComplete, labelMarkAllIncomplete, labelMarkComplete, labelMarkIncomplete, markAllComplete, markAllIncomplete, markComplete, markIncomplete, labelAddItemBottom, labelMoveItemUp, labelMoveItemDown, moveItem } from './actions';
import { WidgetApi, WidgetContextMenuFactory, WidgetMenuItem } from '@/widgets/appModules';
import { Settings } from '@/widgets/to-do-list/settings';

export function createContextMenuFactory(
  settings: Settings,
  getToDoListState: GetToDoListState,
  setToDoListState: SetToDoListState,
  setActiveItemEditorState: SetActiveItemEditorState,
  confirm: WidgetApi['confirm']
): WidgetContextMenuFactory {
  return (contextId) => {
    let ctxMenuItems: WidgetMenuItem[] = []
    const ctxCommonItems: WidgetMenuItem[] = [
      {
        label: labelAddItemTop,
        doAction: async () => activateItemEditor('add-top', setActiveItemEditorState)
      },
      {
        label: labelAddItemBottom,
        doAction: async () => activateItemEditor('add-bottom', setActiveItemEditorState)
      },
      { type: 'separator' },
      {
        label: labelMarkAllIncomplete,
        doAction: async () => markAllIncomplete(getToDoListState, setToDoListState)
      },
      {
        label: labelMarkAllComplete,
        doAction: async () => markAllComplete(getToDoListState, setToDoListState)
      },
      { type: 'separator' },
      {
        label: labelDeleteCompleted,
        enabled: getToDoListState().items.some(item => item.isDone),
        // A bulk delete with no undo: ask first.
        doAction: async () => {
          const ids = new Set(getToDoListState().items.filter(item => item.isDone).map(item => item.id));
          const items = `${ids.size} completed item${ids.size === 1 ? '' : 's'}`;
          if (ids.size > 0 && await confirm(`Delete ${items}? This cannot be undone.`, 'Delete Items')) {
            deleteCompleted(ids, getToDoListState, setToDoListState);
          }
        }
      },
    ]
    if (contextId === '') {
      ctxMenuItems = ctxCommonItems;
    } else {
      const itemId = Number(contextId);
      const { items } = getToDoListState();
      if (!isNaN(itemId)) {
        const itemIdx = items.findIndex(item => item.id === itemId);
        if (itemIdx > -1) {
          const item = items[itemIdx];

          ctxMenuItems = [
            {
              label: item.isDone ? labelMarkIncomplete : labelMarkComplete,
              doAction: item.isDone
                ? async () => markIncomplete(itemId, getToDoListState, setToDoListState)
                : async () => markComplete(itemId, settings.doneToBottom, getToDoListState, setToDoListState)
            }, {
              label: labelEditItem,
              doAction: async () => activateItemEditor(itemId, setActiveItemEditorState)
            }, {
              label: labelDeleteItem,
              doAction: async () => deleteItem(itemId, getToDoListState, setToDoListState)
            },
            { type: 'separator' },
            {
              label: labelMoveItemUp,
              enabled: itemIdx > 0,
              doAction: async () => moveItem(itemId, -1, getToDoListState, setToDoListState)
            }, {
              label: labelMoveItemDown,
              enabled: itemIdx < items.length - 1,
              doAction: async () => moveItem(itemId, 1, getToDoListState, setToDoListState)
            },
            { type: 'separator' },
            ...ctxCommonItems
          ];
        }
      }
    }

    return ctxMenuItems;
  }
}
