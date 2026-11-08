/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { DeactivateWorkflowUseCase } from '@/application/useCases/memSaver/deactivateWorkflow';
import { setCurrentWorkflowSubCase } from '@/application/useCases/project/subs/setCurrentWorkflow';
import { setCurrentProjectSubCase } from '@/application/useCases/projectSwitcher/subs/setCurrentProject';
import { CreateWorkflowSubCase } from '@/application/useCases/workflow/subs/createWorkflow';
import { deleteWorkflowsSubCase } from '@/application/useCases/workflow/subs/deleteWorkflows';
import { RenameWorkflowUseCase } from '@/application/useCases/workflowSwitcher/renameWorkflow';
import { asRecord, idSchema, isNonEmptyString, isOptionalString, notFound, okNull } from '@/application/useCases/ai/actions/inputs';
import { AiAction } from '@/base/ai/aiAction';
import { EntityId } from '@/base/entity';
import { addOneToEntityCollection, getOneFromEntityCollection, updateOneInEntityCollection } from '@/base/entityCollection';
import { addItemToList } from '@/base/list';
import { AppState } from '@/base/state/app';
import { getAllWorkflowNamesFromWorkflowIdList } from '@/base/state/actions/usedNames';
import { getWidgetDisplayName } from '@/base/widget';
import { generateWorkflowName } from '@/base/workflow';

type Deps = {
  appStore: AppStore;
  createWorkflowSubCase: CreateWorkflowSubCase;
  deactivateWorkflowUseCase: DeactivateWorkflowUseCase;
  renameWorkflowUseCase: RenameWorkflowUseCase;
}

const findOwnerProjectId = (state: AppState, workflowId: EntityId) =>
  state.ui.projectSwitcher.projectIds.find(id => state.entities.projects[id]?.workflowIds.includes(workflowId));

const projectName = (state: AppState, id: EntityId) => state.entities.projects[id]?.settings.name ?? id;
const workflowName = (state: AppState, id: EntityId) => state.entities.workflows[id]?.settings.name ?? id;

export function createAppAiActions({
  appStore,
  createWorkflowSubCase,
  deactivateWorkflowUseCase,
  renameWorkflowUseCase,
}: Deps): AiAction[] {
  const describeApp: AiAction<Record<string, never>> = {
    id: 'app.describe',
    description: 'Describe the whole app: projects, their workflows, the widgets in each workflow, and the widget types that can be added.',
    kind: 'read',
    inputSchema: { type: 'object', properties: {} },
    parse: (input) => (asRecord(input) ? {} : undefined),
    describe: () => 'Read the app structure',
    run: () => {
      const state = appStore.get();
      const { entities } = state;
      return {
        ok: true,
        value: {
          currentProjectId: state.ui.projectSwitcher.currentProjectId,
          projects: state.ui.projectSwitcher.projectIds.flatMap(projectId => {
            const project = entities.projects[projectId];
            if (!project) {
              return [];
            }
            return [{
              id: project.id,
              name: project.settings.name,
              currentWorkflowId: project.currentWorkflowId,
              workflows: project.workflowIds.flatMap(workflowId => {
                const workflow = entities.workflows[workflowId];
                if (!workflow) {
                  return [];
                }
                return [{
                  id: workflow.id,
                  name: workflow.settings.name,
                  widgets: workflow.layout.flatMap(item => {
                    const widget = entities.widgets[item.widgetId];
                    if (!widget) {
                      return [];
                    }
                    return [{ id: widget.id, type: widget.type, name: getWidgetDisplayName(widget, entities.widgetTypes[widget.type]) }];
                  })
                }];
              })
            }];
          }),
          widgetTypes: Object.values(entities.widgetTypes).flatMap(t => (t ? [{ id: t.id, name: t.name, description: t.description }] : []))
        }
      };
    }
  };

  const ownerOf = (workflowId: string) => {
    const state = appStore.get();
    return state.entities.workflows[workflowId] ? findOwnerProjectId(state, workflowId) : undefined;
  };

  const switchProject: AiAction<{ projectId: string }> = {
    id: 'project.switch',
    description: 'Make a project the current one.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { projectId: idSchema }, required: ['projectId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.projectId) ? { projectId: o.projectId } : undefined;
    },
    describe: ({ projectId }) => `Switch to project "${projectName(appStore.get(), projectId)}"`,
    run: ({ projectId }) => {
      const state = appStore.get();
      if (!state.entities.projects[projectId]) {
        return notFound('project', projectId);
      }
      appStore.set(setCurrentProjectSubCase(projectId, deactivateWorkflowUseCase, state));
      return okNull;
    }
  };

  const createWorkflow: AiAction<{ projectId: string; name?: string }> = {
    id: 'workflow.create',
    description: 'Create a workflow at the end of a project and switch to it. Without a name, a unique default name is used.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { projectId: idSchema, name: { type: 'string' } }, required: ['projectId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.projectId) && isOptionalString(o.name) ? { projectId: o.projectId, name: o.name } : undefined;
    },
    describe: ({ projectId, name }) => `Create workflow "${name || '(default name)'}" in project "${projectName(appStore.get(), projectId)}"`,
    run: ({ projectId, name }) => {
      let state = appStore.get();
      const project = getOneFromEntityCollection(state.entities.projects, projectId);
      if (!project) {
        return notFound('project', projectId);
      }
      const newWorkflow = createWorkflowSubCase(
        name?.trim() || generateWorkflowName(getAllWorkflowNamesFromWorkflowIdList(state.entities.workflows, project.workflowIds))
      );
      state = {
        ...state,
        entities: {
          ...state.entities,
          projects: updateOneInEntityCollection(state.entities.projects, {
            id: project.id,
            changes: { workflowIds: addItemToList(project.workflowIds, newWorkflow.id) }
          }),
          workflows: addOneToEntityCollection(state.entities.workflows, newWorkflow)
        }
      };
      appStore.set(setCurrentWorkflowSubCase(state, deactivateWorkflowUseCase, project.id, newWorkflow.id, true));
      return { ok: true, value: { workflowId: newWorkflow.id } };
    }
  };

  const renameWorkflow: AiAction<{ workflowId: string; name: string }> = {
    id: 'workflow.rename',
    description: 'Rename a workflow.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { workflowId: idSchema, name: { type: 'string', minLength: 1 } }, required: ['workflowId', 'name'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.workflowId) && isNonEmptyString(o.name) ? { workflowId: o.workflowId, name: o.name.trim() } : undefined;
    },
    describe: ({ workflowId, name }) => `Rename workflow "${workflowName(appStore.get(), workflowId)}" to "${name}"`,
    run: ({ workflowId, name }) => {
      if (!appStore.get().entities.workflows[workflowId]) {
        return notFound('workflow', workflowId);
      }
      renameWorkflowUseCase(workflowId, name);
      return okNull;
    }
  };

  const deleteWorkflow: AiAction<{ workflowId: string }> = {
    id: 'workflow.delete',
    description: 'Delete a workflow and its widgets.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { workflowId: idSchema }, required: ['workflowId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.workflowId) ? { workflowId: o.workflowId } : undefined;
    },
    describe: ({ workflowId }) => `Delete workflow "${workflowName(appStore.get(), workflowId)}"`,
    run: ({ workflowId }) => {
      // Not deleteWorkflowUseCase: it shows its own dialog; runAiRequest already confirmed this action, or the user
      // turned on "always allow".
      const state = appStore.get();
      const ownerProjectId = ownerOf(workflowId);
      if (!ownerProjectId) {
        return notFound('workflow', workflowId);
      }
      appStore.set(deleteWorkflowsSubCase([workflowId], ownerProjectId, state, deactivateWorkflowUseCase));
      return okNull;
    }
  };

  const switchWorkflow: AiAction<{ workflowId: string }> = {
    id: 'workflow.switch',
    description: 'Show a workflow: switch to its project and make it the current workflow.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { workflowId: idSchema }, required: ['workflowId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.workflowId) ? { workflowId: o.workflowId } : undefined;
    },
    describe: ({ workflowId }) => `Switch to workflow "${workflowName(appStore.get(), workflowId)}"`,
    run: ({ workflowId }) => {
      let state = appStore.get();
      const ownerProjectId = ownerOf(workflowId);
      if (!ownerProjectId) {
        return notFound('workflow', workflowId);
      }
      // Same order as revealWidget: the workflow becomes current first, so the project switch
      // activates it instead of loading the workflow the project had open (Memory Saver).
      state = setCurrentWorkflowSubCase(state, deactivateWorkflowUseCase, ownerProjectId, workflowId, true);
      appStore.set(setCurrentProjectSubCase(ownerProjectId, deactivateWorkflowUseCase, state));
      return okNull;
    }
  };

  return [describeApp, switchProject, createWorkflow, renameWorkflow, deleteWorkflow, switchWorkflow] as AiAction[];
}
