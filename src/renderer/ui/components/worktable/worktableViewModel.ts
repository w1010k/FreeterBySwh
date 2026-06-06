/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EntityId } from '@/base/entity';
import { getOneFromEntityCollection } from '@/base/entityCollection';
import { Workflow } from '@/base/workflow';
import { GetImageDataUrlUseCase } from '@/application/useCases/fs/getImageDataUrl';
import { UseAppState } from '@/ui/hooks/appState';
import { useEffect, useMemo, useState } from 'react';

type Deps = {
  useAppState: UseAppState;
  getImageDataUrlUseCase: GetImageDataUrlUseCase;
}

export function createWorktableViewModelHook({
  useAppState,
  getImageDataUrlUseCase,
}: Deps) {
  function useWorktableViewModel() {
    const {
      isEditMode,
      currentWorkflowId,
      workflows,
      _activeWorkflows,
      resizingItem,
      dndDraggingFrom,
      dndDraggingWidgetType,
      dndOverWorktableLayout,
      copiedWidgetIds,
      widgetTypeIds,
      bgColor,
      bgImage,
      bgImageMode,
      bgOpacity,
    } = useAppState(state => {
      const { editMode: isEditMode } = state.ui;
      const { currentProjectId } = state.ui.projectSwitcher;
      const widgetCopies = state.ui.copy.widgets.entities;
      const currentWorkflowId = state.entities.projects[currentProjectId]?.currentWorkflowId;
      const workflows = state.entities.workflows;
      const _activeWorkflows = state.ui.memSaver.activeWorkflows;
      const { resizingItem } = state.ui.worktable;
      const dndDraggingFrom = state.ui.dragDrop.from;
      const dndOverWorktableLayout = state.ui.dragDrop.over?.worktableLayout;
      let widgetTypeId: EntityId | undefined;
      if (dndDraggingFrom?.palette) {
        if (dndDraggingFrom.palette.widgetTypeId) {
          widgetTypeId = dndDraggingFrom.palette.widgetTypeId;
        } else if (dndDraggingFrom.palette.widgetCopyId) {
          widgetTypeId = widgetCopies[dndDraggingFrom.palette.widgetCopyId]?.entity.type;
        }
      } else if (dndDraggingFrom?.topBarList) {
        widgetTypeId = getOneFromEntityCollection(state.entities.widgets, dndDraggingFrom.topBarList.widgetId)?.type;
      } else if (dndDraggingFrom?.worktableLayout) {
        widgetTypeId = getOneFromEntityCollection(state.entities.widgets, dndDraggingFrom.worktableLayout.widgetId)?.type
      }
      const dndDraggingWidgetType = widgetTypeId ? getOneFromEntityCollection(state.entities.widgetTypes, widgetTypeId) : undefined;
      const widgetTypeIds = state.ui.palette.widgetTypeIds;
      const copiedWidgetIds = state.ui.copy.widgets.list;
      const { bgColor, bgImage, bgImageMode, bgOpacity } = state.ui.appConfig;
      return {
        isEditMode,
        currentWorkflowId,
        workflows,
        _activeWorkflows,
        resizingItem,
        dndDraggingFrom,
        dndDraggingWidgetType,
        dndOverWorktableLayout,
        copiedWidgetIds,
        widgetTypeIds,
        bgColor,
        bgImage,
        bgImageMode,
        bgOpacity,
      }
    });

    // Resolve the configured background image (an absolute path) to a data URL
    // the renderer can use in CSS. Re-runs only when the path changes.
    const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
    useEffect(() => {
      if (bgImage === '') {
        setBgImageUrl(null);
        return undefined;
      }
      let cancelled = false;
      getImageDataUrlUseCase(bgImage).then(url => {
        if (!cancelled) {
          setBgImageUrl(url);
        }
      });
      return () => { cancelled = true; };
    }, [bgImage]);

    const activeWorkflows = useMemo(
      () => _activeWorkflows
        .map(({ wflId, prjId }) => ({
          prjId,
          wfl: getOneFromEntityCollection(workflows, wflId)
        }))
        .filter(({ wfl }) => wfl !== undefined) as {
          prjId: string;
          wfl: Workflow;
        }[],
      [_activeWorkflows, workflows]
    )

    const widgetTypes = useAppState.useEntityList(state => state.entities.widgetTypes, widgetTypeIds);
    const copiedWidgets = useAppState.useEntityList(state => state.ui.copy.widgets.entities, copiedWidgetIds);

    const noWorkflows = activeWorkflows.length === 0;

    return {
      isEditMode,
      currentWorkflowId,
      activeWorkflows,
      noWorkflows,
      resizingItem,
      dndDraggingFrom,
      dndDraggingWidgetType,
      dndOverWorktableLayout,
      widgetTypes,
      copiedWidgets,
      bgColor,
      bgImageUrl,
      bgImageMode,
      bgOpacity,
    }
  }

  return useWorktableViewModel;
}

export type WorktableViewModel = ReturnType<typeof createWorktableViewModelHook>;
