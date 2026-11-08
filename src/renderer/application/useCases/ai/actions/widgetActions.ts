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
import { addOneToEntityCollection, removeManyFromEntityCollection, updateManyInEntityCollection, updateOneInEntityCollection } from '@/base/entityCollection';
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

/** The settings a widget would have after the change: the widget type's factory is the validator. */
function settingsAfter(state: AppState, widgetId: EntityId, change: Record<string, unknown>) {
  const widget = state.entities.widgets[widgetId];
  const widgetType = widget && state.entities.widgetTypes[widget.type];
  return widget && widgetType ? { before: widget.settings, after: widgetType.createSettingsState({ ...widget.settings, ...change }) } : undefined;
}

const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

/** Every changed value in full (runAiRequest refuses a confirm text too long to show). */
function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const changes = changedKeys(before, after).map(k => `${k} = ${JSON.stringify(after[k])}`);
  return changes.length > 0 ? changes.join('; ') : '(no change)';
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
    // A Terminal starts a shell as soon as it shows.
    alwaysConfirm: ({ widgetTypeId }) => !!appStore.get().entities.widgetTypes[widgetTypeId]?.runsPrograms,
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

  const getWidget: AiAction<{ widgetId: string }> = {
    id: 'widget.get',
    description: 'Read a widget: type, name, settings, and its workflow (null for a widget on the shelf).',
    kind: 'read',
    inputSchema: { type: 'object', properties: { widgetId: idSchema }, required: ['widgetId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.widgetId) ? { widgetId: o.widgetId } : undefined;
    },
    describe: ({ widgetId }) => `Read widget "${widgetName(appStore.get(), widgetId)}"`,
    run: ({ widgetId }) => {
      const state = appStore.get();
      const widget = state.entities.widgets[widgetId];
      if (!widget) {
        return notFound('widget', widgetId);
      }
      return {
        ok: true,
        value: {
          id: widget.id,
          type: widget.type,
          name: widgetName(state, widgetId),
          settings: widget.settings,
          workflowId: findWorkflowOfWidget(state, widgetId)?.id ?? null
        }
      };
    }
  };

  const updateSettings: AiAction<{ widgetId: string; settings: Record<string, unknown> }> = {
    id: 'widget.updateSettings',
    description: 'Change some settings of a widget (see widget.get for the current ones). Values of a wrong type fall back to the widget\'s defaults.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { widgetId: idSchema, settings: { type: 'object' } }, required: ['widgetId', 'settings'] },
    parse: (input) => {
      const o = asRecord(input);
      const settings = o && asRecord(o.settings);
      if (!o || !isNonEmptyString(o.widgetId) || !settings) {
        return undefined;
      }
      // The settings editor offers only existing shared keys; a missing one makes the widget drop every save.
      const state = appStore.get();
      const after = settingsAfter(state, o.widgetId, settings)?.after as { sharedKeyId?: unknown } | undefined;
      const keyId = after?.sharedKeyId;
      if (typeof keyId === 'string' && !Object.hasOwn(state.entities.sharedDataKeys, keyId)) {
        return undefined;
      }
      return { widgetId: o.widgetId, settings };
    },
    // Commands and files to open are settings: a change there runs on the PC when the user clicks later.
    alwaysConfirm: ({ widgetId, settings }) => {
      const state = appStore.get();
      const widget = state.entities.widgets[widgetId];
      const type = widget && state.entities.widgetTypes[widget.type];
      if (!type) {
        return false;
      }
      // The stored values decide, not the keys sent: a widget type can derive a setting from another key.
      const s = settingsAfter(state, widgetId, settings);
      // Both sides through the widget type, so a value it only fills in (absent → default) is no change.
      const changed = s ? changedKeys(type.createSettingsState(s.before) as Record<string, unknown>, s.after as Record<string, unknown>) : [];
      return !!type.runsPrograms || (type.confirmSettings ?? []).some(k => changed.includes(k));
    },
    // Shows what will be stored, not the input: a setting can be a script injected into web pages (Webpage injectedJS).
    describe: ({ widgetId, settings }) => {
      const state = appStore.get();
      const s = settingsAfter(state, widgetId, settings);
      return `Change settings of widget "${widgetName(state, widgetId)}": ${s ? describeChanges(s.before, s.after) : '(unknown widget)'}`;
    },
    run: ({ widgetId, settings }) => {
      const state = appStore.get();
      const widget = state.entities.widgets[widgetId];
      const widgetType = widget && state.entities.widgetTypes[widget.type];
      if (!widget || !widgetType) {
        return notFound('widget', widgetId);
      }
      const newSettings = widgetType.createSettingsState({ ...widget.settings, ...settings });
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          widgets: updateOneInEntityCollection(state.entities.widgets, { id: widgetId, changes: { settings: newSettings } })
        }
      });
      return { ok: true, value: { settings: newSettings } };
    }
  };

  const moveWidget: AiAction<{ widgetId: string; toWorkflowId: string }> = {
    id: 'widget.move',
    description: 'Move a widget from its workflow to another workflow.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { widgetId: idSchema, toWorkflowId: idSchema }, required: ['widgetId', 'toWorkflowId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.widgetId) && isNonEmptyString(o.toWorkflowId) ? { widgetId: o.widgetId, toWorkflowId: o.toWorkflowId } : undefined;
    },
    describe: ({ widgetId, toWorkflowId }) => {
      const state = appStore.get();
      return `Move widget "${widgetName(state, widgetId)}" to workflow "${state.entities.workflows[toWorkflowId]?.settings.name ?? toWorkflowId}"`;
    },
    run: ({ widgetId, toWorkflowId }) => {
      const state = appStore.get();
      const from = findWorkflowOfWidget(state, widgetId);
      if (!from) {
        return notFound('widget in a workflow', widgetId);
      }
      const to = state.entities.workflows[toWorkflowId];
      if (!to) {
        return notFound('workflow', toWorkflowId);
      }
      if (from.id === to.id) {
        return okNull;
      }
      const item = from.layout.find(i => i.widgetId === widgetId);
      const [fromLayout] = deleteWidgetsFromWidgetLayoutSubCase([widgetId], from.layout);
      const toLayout = addItemToWidgetLayoutSubCase(widgetId, to.layout, { w: item?.rect.w ?? 1, h: item?.rect.h ?? 1 });
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          workflows: updateManyInEntityCollection(state.entities.workflows, [
            { id: from.id, changes: { layout: fromLayout } },
            { id: to.id, changes: { layout: toLayout } }
          ])
        }
      });
      return okNull;
    }
  };

  return [addWidget, renameWidget, deleteWidget, getWidget, updateSettings, moveWidget] as AiAction[];
}
