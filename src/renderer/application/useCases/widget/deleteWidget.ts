/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { confirmDialog } from '@/helpers/confirmDialog';
import { AppStore } from '@/application/interfaces/store';
import { deleteWidgetsFromWidgetListSubCase } from '@/application/useCases/shelf/subs/deleteWidgetsFromWidgetList';
import { deleteWidgetsFromWidgetLayoutSubCase } from '@/application/useCases/workflow/subs/deleteWidgetsFromWidgetLayout';
import { EntityId } from '@/base/entity';
import { getOneFromEntityCollection, removeManyFromEntityCollection, updateOneInEntityCollection } from '@/base/entityCollection';
import { WidgetEnv, getWidgetDisplayName } from '@/base/widget';

type Deps = {
  appStore: AppStore;
  dialog: DialogProvider;
}

function omitKeys<T>(rec: Record<EntityId, T>, keys: ReadonlyArray<EntityId>): Record<EntityId, T> {
  if (keys.length < 1) {
    return rec;
  }
  let hit = false;
  for (const k of keys) {
    if (k in rec) {
      hit = true;
      break;
    }
  }
  if (!hit) {
    return rec;
  }
  const next: Record<EntityId, T> = { ...rec };
  for (const k of keys) {
    delete next[k];
  }
  return next;
}

export function createDeleteWidgetUseCase({
  appStore,
  dialog,
}: Deps) {
  const useCase = async (widgetId: EntityId, env: WidgetEnv) => {
    const state = appStore.get();
    const widget = getOneFromEntityCollection(state.entities.widgets, widgetId);
    if (!widget) {
      return;
    }

    const widgetType = getOneFromEntityCollection(state.entities.widgetTypes, widget.type);
    const name = getWidgetDisplayName(widget, widgetType);
    if (await confirmDialog(dialog, `Delete the "${name}" widget?`, 'Delete Widget')) {
      switch (env.area) {
        case 'shelf': {
          const [newList, delIds] = deleteWidgetsFromWidgetListSubCase([widgetId], state.ui.shelf.widgetList);
          if (delIds.length < 1) {
            return;
          }
          appStore.set({
            ...state,
            entities: {
              ...state.entities,
              widgets: removeManyFromEntityCollection(state.entities.widgets, delIds)
            },
            ui: {
              ...state.ui,
              shelf: {
                ...state.ui.shelf,
                widgetList: newList
              },
              widgetDynamicTitles: omitKeys(state.ui.widgetDynamicTitles, delIds)
            }
          })
          break;
        }
        case 'workflow': {
          const workflow = getOneFromEntityCollection(state.entities.workflows, env.workflowId)
          if (!workflow) {
            return;
          }
          const [newLayout, delIds] = deleteWidgetsFromWidgetLayoutSubCase([widgetId], workflow.layout)
          appStore.set({
            ...state,
            entities: {
              ...state.entities,
              widgets: removeManyFromEntityCollection(state.entities.widgets, delIds),
              workflows: updateOneInEntityCollection(state.entities.workflows, {
                id: env.workflowId,
                changes: {
                  layout: newLayout
                }
              })
            },
            ui: {
              ...state.ui,
              widgetDynamicTitles: omitKeys(state.ui.widgetDynamicTitles, delIds)
            }
          })
          break;
        }
      }
    }
  }

  return useCase;
}

export type DeleteWidgetUseCase = ReturnType<typeof createDeleteWidgetUseCase>;
