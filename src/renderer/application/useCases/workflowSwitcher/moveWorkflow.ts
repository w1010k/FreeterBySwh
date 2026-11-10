/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { EntityId } from '@/base/entity';
import { moveItemInList } from '@/base/list';
import { entityStateActions } from '@/base/state/actions';

type Deps = {
  appStore: AppStore;
}

/** One place back (-1) or forward (1) in its project: the menu and keyboard way to do what dragging a tab does. */
export function createMoveWorkflowUseCase({
  appStore,
}: Deps) {
  const useCase = (projectId: EntityId, workflowId: EntityId, offset: -1 | 1) => {
    const state = appStore.get();
    const project = entityStateActions.projects.getOne(state, projectId);
    if (!project) {
      return;
    }
    const idx = project.workflowIds.indexOf(workflowId);
    const toIdx = idx + offset;
    if (idx === -1 || toIdx < 0 || toIdx >= project.workflowIds.length) {
      return;
    }
    appStore.set(entityStateActions.projects.updateOne(state, {
      id: projectId,
      changes: { workflowIds: moveItemInList(project.workflowIds, idx, toIdx) }
    }));
  }

  return useCase;
}

export type MoveWorkflowUseCase = ReturnType<typeof createMoveWorkflowUseCase>;
