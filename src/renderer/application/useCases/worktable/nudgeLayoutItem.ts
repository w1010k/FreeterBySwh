/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { EntityId } from '@/base/entity';
import { AppState } from '@/base/state/app';
import { entityStateActions } from '@/base/state/actions';
import { moveLayoutItem, resizeLayoutItemByEdges, widgetLayoutVisibleCols } from '@/base/widgetLayout';

type Deps = {
  appStore: AppStore;
}

/** In grid cells: move by x/y, or grow (or shrink, if negative) the widget by w/h. */
export interface LayoutItemNudge {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

/** The workflow's layout after the nudge; the same layout object when it changes nothing. */
function nudgedLayout(state: AppState, workflowId: EntityId, widgetId: EntityId, nudge: LayoutItemNudge) {
  const workflow = entityStateActions.workflows.getOne(state, workflowId);
  const item = workflow?.layout.find(layoutItem => layoutItem.widgetId === widgetId);
  if (!workflow || !item) {
    return undefined;
  }
  let layout = workflow.layout;
  if (nudge.x || nudge.y) {
    layout = moveLayoutItem(layout, item.id, { x: Math.max(0, item.rect.x + (nudge.x ?? 0)), y: Math.max(0, item.rect.y + (nudge.y ?? 0)) });
  }
  if (nudge.w || nudge.h) {
    const widget = entityStateActions.widgets.getOne(state, widgetId);
    const minSize = (widget && entityStateActions.widgetTypes.getOne(state, widget.type)?.minSize) || { w: 1, h: 1 };
    // At the right edge of the grid, the width changes at the left edge (as the left resize handle does): Wider can
    // still grow, and Narrower undoes it.
    const atRightEdge = item.rect.x + item.rect.w >= widgetLayoutVisibleCols;
    const delta = nudge.w && atRightEdge ? { left: nudge.w, bottom: nudge.h } : { right: nudge.w, bottom: nudge.h };
    layout = resizeLayoutItemByEdges(layout, item.id, delta, minSize);
  }
  return { workflow, layout };
}

/**
 * Move or resize a workflow widget by grid cells: the menu and keyboard way to do what dragging it or its edge does.
 * The same layout rules apply (grid bounds, the widget type's minimum size, pushing overlapped widgets down).
 * `canNudge` tells whether a nudge would change anything (a menu disables the ones that would not).
 */
export function createNudgeLayoutItemUseCase({
  appStore,
}: Deps) {
  const useCase = (workflowId: EntityId, widgetId: EntityId, nudge: LayoutItemNudge) => {
    const state = appStore.get();
    const res = nudgedLayout(state, workflowId, widgetId, nudge);
    if (res && res.layout !== res.workflow.layout) {
      appStore.set(entityStateActions.workflows.updateOne(state, { id: workflowId, changes: { layout: res.layout } }));
    }
  }
  const canNudge = (workflowId: EntityId, widgetId: EntityId, nudge: LayoutItemNudge) => {
    const res = nudgedLayout(appStore.get(), workflowId, widgetId, nudge);
    return !!res && res.layout !== res.workflow.layout;
  }

  return Object.assign(useCase, { canNudge });
}

export type NudgeLayoutItemUseCase = ReturnType<typeof createNudgeLayoutItemUseCase>;
