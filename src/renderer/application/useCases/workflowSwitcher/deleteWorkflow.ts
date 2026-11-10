/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { DialogProvider } from '@/application/interfaces/dialogProvider';
import { confirmDialog } from '@/helpers/confirmDialog';
import { AppStore } from '@/application/interfaces/store';
import { DeactivateWorkflowUseCase } from '@/application/useCases/memSaver/deactivateWorkflow';
import { deleteWorkflowsSubCase } from '@/application/useCases/workflow/subs/deleteWorkflows';
import { EntityId } from '@/base/entity';
import { getOneFromEntityCollection } from '@/base/entityCollection';

type Deps = {
  appStore: AppStore;
  dialog: DialogProvider;
  deactivateWorkflowUseCase: DeactivateWorkflowUseCase;
}
export function createDeleteWorkflowUseCase({
  appStore,
  dialog,
  deactivateWorkflowUseCase,
}: Deps) {
  const useCase = async (workflowId: EntityId) => {
    let state = appStore.get();
    const workflow = getOneFromEntityCollection(state.entities.workflows, workflowId);
    if (workflow) {
      const { currentProjectId } = state.ui.projectSwitcher;
      const currentProject = getOneFromEntityCollection(state.entities.projects, currentProjectId);
      if (currentProject) {
        if (await confirmDialog(dialog, `Delete the "${workflow.settings.name}" workflow and all its widgets?`, 'Delete Workflow')) {
          state = deleteWorkflowsSubCase([workflowId], currentProjectId, state, deactivateWorkflowUseCase)
          appStore.set(state);
        }
      }
    }
  }

  return useCase;
}

export type DeleteWorkflowUseCase = ReturnType<typeof createDeleteWorkflowUseCase>;
