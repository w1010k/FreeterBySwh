/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { IdGenerator } from '@/application/interfaces/idGenerator';
import { AppStore } from '@/application/interfaces/store';
import { asRecord, idSchema, isNonEmptyString, isOptionalString, notFound, okNull } from '@/application/useCases/ai/actions/inputs';
import { DeactivateWorkflowUseCase } from '@/application/useCases/memSaver/deactivateWorkflow';
import { deactivateWorkflowSubCase } from '@/application/useCases/memSaver/subs/deactivateWorkflow';
import { deleteProjectsSubCase } from '@/application/useCases/project/subs/deleteProjects';
import { setCurrentProjectSubCase } from '@/application/useCases/projectSwitcher/subs/setCurrentProject';
import { CreateWorkflowSubCase } from '@/application/useCases/workflow/subs/createWorkflow';
import { AiAction } from '@/base/ai/aiAction';
import { EntityId } from '@/base/entity';
import { addOneToEntityCollection, removeManyFromEntityCollection, updateOneInEntityCollection } from '@/base/entityCollection';
import { createProject, generateProjectName } from '@/base/project';
import { AppState } from '@/base/state/app';
import { getAllProjectNamesFromProjectIdList } from '@/base/state/actions/usedNames';
import { generateWorkflowName } from '@/base/workflow';

type Deps = {
  appStore: AppStore;
  idGenerator: IdGenerator;
  createWorkflowSubCase: CreateWorkflowSubCase;
  deactivateWorkflowUseCase: DeactivateWorkflowUseCase;
}

const projectName = (state: AppState, id: EntityId) => state.entities.projects[id]?.settings.name ?? id;

export function createProjectAiActions({
  appStore,
  idGenerator,
  createWorkflowSubCase,
  deactivateWorkflowUseCase,
}: Deps): AiAction[] {
  const createProjectAction: AiAction<{ name?: string }> = {
    id: 'project.create',
    description: 'Create a project with one empty workflow, at the end of the project list. The current project does not change.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    parse: (input) => {
      const o = asRecord(input);
      return o && isOptionalString(o.name) ? { name: o.name } : undefined;
    },
    describe: ({ name }) => `Create project "${name?.trim() || '(default name)'}"`,
    run: ({ name }) => {
      const state = appStore.get();
      const { projectIds } = state.ui.projectSwitcher;
      const project = createProject(
        idGenerator(),
        name?.trim() || generateProjectName(getAllProjectNamesFromProjectIdList(state.entities.projects, projectIds))
      );
      // Same first workflow as a project added in the Project Manager.
      const workflow = createWorkflowSubCase(generateWorkflowName([]));
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          projects: addOneToEntityCollection(state.entities.projects, { ...project, workflowIds: [workflow.id], currentWorkflowId: workflow.id }),
          workflows: addOneToEntityCollection(state.entities.workflows, workflow)
        },
        ui: { ...state.ui, projectSwitcher: { ...state.ui.projectSwitcher, projectIds: [...projectIds, project.id] } }
      });
      return { ok: true, value: { projectId: project.id, workflowId: workflow.id } };
    }
  };

  const renameProject: AiAction<{ projectId: string; name: string }> = {
    id: 'project.rename',
    description: 'Rename a project.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { projectId: idSchema, name: { type: 'string', minLength: 1 } }, required: ['projectId', 'name'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.projectId) && isNonEmptyString(o.name) ? { projectId: o.projectId, name: o.name.trim() } : undefined;
    },
    describe: ({ projectId, name }) => `Rename project "${projectName(appStore.get(), projectId)}" to "${name}"`,
    run: ({ projectId, name }) => {
      const state = appStore.get();
      const project = state.entities.projects[projectId];
      if (!project) {
        return notFound('project', projectId);
      }
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          projects: updateOneInEntityCollection(state.entities.projects, { id: projectId, changes: { settings: { ...project.settings, name } } })
        }
      });
      return okNull;
    }
  };

  const deleteProject: AiAction<{ projectId: string }> = {
    id: 'project.delete',
    description: 'Delete a project with all its workflows and widgets. The last project cannot be deleted.',
    kind: 'write',
    inputSchema: { type: 'object', properties: { projectId: idSchema }, required: ['projectId'] },
    parse: (input) => {
      const o = asRecord(input);
      return o && isNonEmptyString(o.projectId) ? { projectId: o.projectId } : undefined;
    },
    describe: ({ projectId }) => `Delete project "${projectName(appStore.get(), projectId)}" and all its workflows`,
    run: ({ projectId }) => {
      // Same result as deleting in the Project Manager and saving.
      let state = appStore.get();
      const { projectIds, currentProjectId } = state.ui.projectSwitcher;
      if (!state.entities.projects[projectId] || !projectIds.includes(projectId)) {
        return notFound('project', projectId);
      }
      if (projectIds.length < 2) {
        return { ok: false, code: 'invalid_input', message: 'The last project cannot be deleted' };
      }
      const [newProjectIds, newCurrentProjectId, delProjectIds, delWorkflowIds, delWidgetIds] =
        deleteProjectsSubCase([projectId], projectIds, currentProjectId, state.entities.projects, state.entities.workflows);
      let memSaver = state.ui.memSaver;
      for (const wflId of delWorkflowIds) {
        memSaver = deactivateWorkflowSubCase(wflId, memSaver);
      }
      state = {
        ...state,
        entities: {
          ...state.entities,
          projects: removeManyFromEntityCollection(state.entities.projects, delProjectIds),
          workflows: removeManyFromEntityCollection(state.entities.workflows, delWorkflowIds),
          widgets: removeManyFromEntityCollection(state.entities.widgets, delWidgetIds)
        },
        ui: { ...state.ui, memSaver, projectSwitcher: { ...state.ui.projectSwitcher, projectIds: newProjectIds } }
      };
      appStore.set(setCurrentProjectSubCase(newCurrentProjectId, deactivateWorkflowUseCase, state));
      return okNull;
    }
  };

  return [createProjectAction, renameProject, deleteProject] as AiAction[];
}
