/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EntityId } from '@/base/entity';
import { moveItemInList } from '@/base/list';
import { AppStore } from '@/application/interfaces/store';
import { dragDropStateActions, entityStateActions } from '@/base/state/actions';

type Deps = {
  appStore: AppStore;
}
export function createDropOnWorkflowSwitcherUseCase({
  appStore,
}: Deps) {
  const useCase = (targetProjectId: EntityId, overWorkflowId: EntityId | null) => {
    let state = appStore.get();
    const { from: draggingFrom } = state.ui.dragDrop;
    if (draggingFrom?.workflowSwitcher) {
      const { projectId: sourceProjectId, workflowId } = draggingFrom.workflowSwitcher;
      // Only a reorder within the tab's own project. The tab bar shows the current project alone, so a drop never
      // targets another one. Moving a workflow to another project would also have to move its Memory Saver
      // `activeWorkflows[].prjId`: To-Do widgets read their scope from it, and a stale one makes them save their old
      // project's list over the new project's.
      const project = sourceProjectId === targetProjectId ? entityStateActions.projects.getOne(state, targetProjectId) : undefined;
      if (project) {
        const { workflowIds } = project;
        const sourceIdx = workflowIds.indexOf(workflowId);
        const targetIdx = overWorkflowId ? workflowIds.indexOf(overWorkflowId) : undefined;
        if (sourceIdx !== -1 && targetIdx !== -1) {
          state = entityStateActions.projects.updateOne(state, {
            id: targetProjectId,
            changes: {
              workflowIds: moveItemInList(workflowIds, sourceIdx, targetIdx)
            }
          })
        }
      }
    }
    state = dragDropStateActions.resetAll(state);
    appStore.set(state);
  }

  return useCase;
}

export type DropOnWorkflowSwitcherUseCase = ReturnType<typeof createDropOnWorkflowSwitcherUseCase>;
