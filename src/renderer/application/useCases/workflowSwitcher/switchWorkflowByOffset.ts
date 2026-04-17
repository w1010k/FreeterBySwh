/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { SwitchWorkflowUseCase } from '@/application/useCases/workflowSwitcher/switchWorkflow';

type Deps = {
  appStore: AppStore;
  switchWorkflowUseCase: SwitchWorkflowUseCase;
}

export function createSwitchWorkflowByOffsetUseCase({
  appStore,
  switchWorkflowUseCase,
}: Deps) {
  return function switchWorkflowByOffsetUseCase(offset: number) {
    const state = appStore.get();
    const { currentProjectId } = state.ui.projectSwitcher;
    const project = state.entities.projects[currentProjectId];
    if (!project) {
      return;
    }
    const { workflowIds, currentWorkflowId } = project;
    if (workflowIds.length < 2) {
      return;
    }
    const currentIdx = workflowIds.indexOf(currentWorkflowId);
    const fromIdx = currentIdx < 0 ? 0 : currentIdx;
    const len = workflowIds.length;
    const nextIdx = ((fromIdx + offset) % len + len) % len;
    const nextWorkflowId = workflowIds[nextIdx];
    if (nextWorkflowId === currentWorkflowId) {
      return;
    }
    switchWorkflowUseCase(currentProjectId, nextWorkflowId);
  }
}

export type SwitchWorkflowByOffsetUseCase = ReturnType<typeof createSwitchWorkflowByOffsetUseCase>;
