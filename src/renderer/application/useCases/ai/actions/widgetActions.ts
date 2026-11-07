/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { CreateWidgetSubCase } from '@/application/useCases/widget/subs/createWidget';
import { AddItemToWidgetLayoutSubCase } from '@/application/useCases/workflow/subs/addItemToWidgetLayout';
import { deleteWidgetsFromWidgetLayoutSubCase } from '@/application/useCases/workflow/subs/deleteWidgetsFromWidgetLayout';
import { asRecord, idSchema, isNonEmptyString, isOptionalString, notFound, okNull } from '@/application/useCases/ai/actions/inputs';
import { AiAction } from '@/base/ai/aiAction';
import { EntityId } from '@/base/entity';
import { addOneToEntityCollection, removeManyFromEntityCollection, updateOneInEntityCollection } from '@/base/entityCollection';
import { AppState } from '@/base/state/app';
import { getWidgetDisplayName } from '@/base/widget';

type Deps = {
  appStore: AppStore;
  createWidgetSubCase: CreateWidgetSubCase;
  addItemToWidgetLayoutSubCase: AddItemToWidgetLayoutSubCase;
}

const widgetName = (state: AppState, id: EntityId) => {
  const widget = state.entities.widgets[id];
  return widget ? getWidgetDisplayName(widget, state.entities.widgetTypes[widget.type]) : id;
}

const findWorkflowOfWidget = (state: AppState, widgetId: EntityId) =>
  Object.values(state.entities.workflows).find(w => w?.layout.some(item => item.widgetId === widgetId));

export function createWidgetAiActions({
  appStore,
  createWidgetSubCase,
  addItemToWidgetLayoutSubCase,
}: Deps): AiAction[] {
  const addWidget: AiAction<{ workflowId: string; widgetTypeId: string; name?: string }> = {
    id: 'widget.add',
    description: 'Add a widget of a type (see app.describe widgetTypes) to a workflow. Without a name, the widget shows its type name.',
    kind: 'write',
    inputSchema: {
      type: 'object',
      properties: { workflowId: idSchema, widgetTypeId: idSchema, name: { type: 'string' } },
      required: ['workflowId', 'widgetTypeId']
    },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.workflowId) && isNonEmptyString(o.widgetTypeId) && isOptionalString(o.name)
        ? { workflowId: o.workflowId, widgetTypeId: o.widgetTypeId, name: o.name }
        : undefined;
    },
    describe: ({ workflowId, widgetTypeId }) => {
      const state = appStore.get();
      const typeName = state.entities.widgetTypes[widgetTypeId]?.name ?? widgetTypeId;
      return `Add a ${typeName} widget to workflow "${state.entities.workflows[workflowId]?.settings.name ?? workflowId}"`;
    },
    run: ({ workflowId, widgetTypeId, name }) => {
      const state = appStore.get();
      const widgetType = state.entities.widgetTypes[widgetTypeId];
      if (!widgetType) {
        return notFound('widget type', widgetTypeId);
      }
      const workflow = state.entities.workflows[workflowId];
      if (!workflow) {
        return notFound('workflow', workflowId);
      }
      const newWidget = createWidgetSubCase(widgetType, name ?? '');
      const layout = addItemToWidgetLayoutSubCase(newWidget.id, workflow.layout, { w: widgetType.minSize.w, h: widgetType.minSize.h });
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          widgets: addOneToEntityCollection(state.entities.widgets, newWidget),
          workflows: updateOneInEntityCollection(state.entities.workflows, { id: workflow.id, changes: { layout } })
        }
      });
      return { ok: true, value: { widgetId: newWidget.id } };
    }
  };

  const renameWidget: AiAction<{ widgetId: string; name: string }> = {
    id: 'widget.rename',
    description: 'Rename a widget. An empty name makes it show its type name.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { widgetId: idSchema, name: { type: 'string' } }, required: ['widgetId', 'name'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.widgetId) && typeof o.name === 'string' ? { widgetId: o.widgetId, name: o.name } : undefined;
    },
    describe: ({ widgetId, name }) => `Rename widget "${widgetName(appStore.get(), widgetId)}" to "${name}"`,
    run: ({ widgetId, name }) => {
      const state = appStore.get();
      const widget = state.entities.widgets[widgetId];
      if (!widget) {
        return notFound('widget', widgetId);
      }
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          widgets: updateOneInEntityCollection(state.entities.widgets, { id: widgetId, changes: { coreSettings: { ...widget.coreSettings, name } } })
        }
      });
      return okNull;
    }
  };

  const deleteWidget: AiAction<{ widgetId: string }> = {
    id: 'widget.delete',
    description: 'Delete a widget from its workflow.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { widgetId: idSchema }, required: ['widgetId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.widgetId) ? { widgetId: o.widgetId } : undefined;
    },
    describe: ({ widgetId }) => `Delete widget "${widgetName(appStore.get(), widgetId)}"`,
    run: ({ widgetId }) => {
      // Same result as deleteWidgetUseCase's workflow branch, without its own dialog.
      // ponytail: shelf widgets are out of scope until the next action set.
      const state = appStore.get();
      const workflow = findWorkflowOfWidget(state, widgetId);
      if (!workflow) {
        return notFound('widget in a workflow', widgetId);
      }
      const [layout, delIds] = deleteWidgetsFromWidgetLayoutSubCase([widgetId], workflow.layout);
      const deleted = new Set(delIds);
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          widgets: removeManyFromEntityCollection(state.entities.widgets, delIds),
          workflows: updateOneInEntityCollection(state.entities.workflows, { id: workflow.id, changes: { layout } })
        },
        ui: {
          ...state.ui,
          widgetDynamicTitles: Object.fromEntries(Object.entries(state.ui.widgetDynamicTitles).filter(([id]) => !deleted.has(id)))
        }
      });
      return okNull;
    }
  };

  return [addWidget, renameWidget, deleteWidget] as AiAction[];
}
