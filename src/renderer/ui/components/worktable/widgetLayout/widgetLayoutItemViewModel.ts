/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {ActionBarItem} from '@/base/actionBar';
import {
  WorktableStateResizingItemEdges,
  WorktableStateResizingItemEdgeX,
  WorktableStateResizingItemEdgeY
} from '@/base/state/ui';
import {WidgetEnvAreaWorkflow} from '@/base/widget';
import {WidgetLayoutItemRect, widgetLayoutVisibleCols, widgetLayoutVisibleRows} from '@/base/widgetLayout';
import {maximize14Svg, unmaximize14Svg} from '@/ui/assets/images/appIcons';
import {
  calcGridColWidth,
  calcGridRowHeight,
  clamp,
  itemHUnitsToPx,
  itemRectUnitsToPx,
  itemWUnitsToPx,
  itemXPxToUnits,
  itemYPxToUnits
} from '@/ui/components/worktable/widgetLayout/calcs';
import {resizeEdgesByHandleId, ResizeHandleId} from '@/ui/components/worktable/widgetLayout/resizeHandles';
import {RectPx, WHPx, XYPx} from '@/ui/types/dimensions';
import {DragEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState} from 'react';

export interface WidgetLayoutItemProps {
  id: string;
  w: number;
  h: number;
  x: number;
  y: number;
  resizingMinSize?: {
    w: number;
    h: number;
  }
  env: WidgetEnvAreaWorkflow;
  widgetId: string;
  isEditable: boolean;
  isDragging: boolean;
  viewportSize: WHPx;
  viewportElRef: React.RefObject<HTMLElement | null>;
  onDragStart: (evt: DragEvent<HTMLElement>, itemId: string) => void;
  onDragEnd: (evt: DragEvent<HTMLElement>) => void;
  onResizeStart: (itemId: string, edges: WorktableStateResizingItemEdges) => void;
  onResize: (delta: {
    x?: number | undefined;
    y?: number | undefined;
  }) => void;
  onResizeEnd: (delta: {
    x?: number | undefined;
    y?: number | undefined;
  }) => void;
}

export interface ResizingState {
  draggingEdges: WorktableStateResizingItemEdges;
  initialItemRectUnits: WidgetLayoutItemRect;
  rectPx: RectPx;
  fromPointPx: XYPx
}

function calcDeltasForMouseEvent(evt: MouseEvent, fromPointPx: XYPx, colWidth: number, rowHeight: number, xMulti: number, yMulti: number) {
  const deltaPx = {
    x: evt.pageX - fromPointPx.xPx,
    y: evt.pageY - fromPointPx.yPx
  }
  const deltaUnits = {
    x: itemXPxToUnits(deltaPx.x, colWidth) * xMulti,
    y: itemYPxToUnits(deltaPx.y, rowHeight) * yMulti
  }
  return {
    deltaPx,
    deltaUnits
  }
}

export function useWidgetLayoutItemViewModel(props: WidgetLayoutItemProps) {
  const {
    id, x, y, w, h, viewportSize, env, widgetId, resizingMinSize, isEditable, isDragging, viewportElRef,
    onDragStart, onDragEnd, onResize, onResizeEnd, onResizeStart
  } = props;

  const [maximized, setMaximized] = useState(false);
  const [resizing, setResizing] = useState<ResizingState | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const isResizing = !!resizing;

  const colWidth = calcGridColWidth(viewportSize);
  const rowHeight = calcGridRowHeight(viewportSize);

  const isMaximized = maximized && !isEditable;

  useEffect(() => {
    if (viewportElRef.current) {
      setScrollTop(viewportElRef.current.scrollTop);
    }
  }, [viewportElRef]);

  let rectPx: RectPx;
  if (resizing) {
    rectPx = resizing.rectPx;
  } else if (isMaximized) {
    rectPx = itemRectUnitsToPx({
      x: 0,
      y: 0,
      w: widgetLayoutVisibleCols,
      h: widgetLayoutVisibleRows
    }, colWidth, rowHeight);
    rectPx.yPx = rectPx.yPx + scrollTop;
  } else {
    rectPx = itemRectUnitsToPx({x, y, w, h}, colWidth, rowHeight);
  }

  const onDragStartHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    onDragStart(evt, id);
  }, [id, onDragStart]);

  const onDragEndHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    onDragEnd(evt);
  }, [onDragEnd]);

  const onResizeMouseMoveHandler = useCallback((evt: MouseEvent) => {
    if (!isResizing) {
      return;
    }

    const minWPx = itemWUnitsToPx(resizingMinSize?.w || 1, colWidth);
    const minHPx = itemHUnitsToPx(resizingMinSize?.h || 1, rowHeight);
    const initialItemRectPx = itemRectUnitsToPx(resizing.initialItemRectUnits, colWidth, rowHeight);

    const {deltaPx, deltaUnits} = calcDeltasForMouseEvent(
      evt,
      resizing.fromPointPx,
      colWidth,
      rowHeight,
      resizing.draggingEdges.x === WorktableStateResizingItemEdgeX.Left ? -1 : 1,
      resizing.draggingEdges.y === WorktableStateResizingItemEdgeY.Top ? -1 : 1
    );

    const newRectPx = {
      ...resizing.rectPx
    }

    if (resizing.draggingEdges.x) {
      if (resizing.draggingEdges.x === WorktableStateResizingItemEdgeX.Left) {
        const initialItemRightPx = initialItemRectPx.xPx + initialItemRectPx.wPx;
        newRectPx.wPx = clamp(initialItemRectPx.wPx - deltaPx.x, minWPx, initialItemRightPx);
        newRectPx.xPx = clamp(initialItemRectPx.xPx + deltaPx.x, 0, initialItemRightPx - minWPx);
      } else {
        // Cap the live width so the right edge can't visibly overshoot the grid
        // (x + w <= cols), mirroring the committed-state clamp in resizeLayoutItemByEdges.
        // Never below the starting width, so an item already past the edge doesn't
        // shrink when dragged outward (same floor as the committed clamp).
        // Measured from the starting rect: the live `x` prop follows the in-progress
        // layout, which can shift the item leftward mid-drag (see below).
        const initialUnits = resizing.initialItemRectUnits;
        const capWPx = itemWUnitsToPx(widgetLayoutVisibleCols - initialUnits.x, colWidth);
        const maxWPx = Math.max(capWPx, initialItemRectPx.wPx);
        newRectPx.wPx = clamp(initialItemRectPx.wPx + deltaPx.x, minWPx, maxWPx);
        // minSize can outrank the cap; like resizeLayoutItemByEdges, an item that
        // fit the grid then grows leftward so its right edge stays at the grid edge.
        newRectPx.xPx = newRectPx.wPx > capWPx && initialUnits.x + initialUnits.w <= widgetLayoutVisibleCols
          ? initialItemRectPx.xPx + capWPx - newRectPx.wPx
          : initialItemRectPx.xPx;
      }
    }
    if (resizing.draggingEdges.y) {
      if (resizing.draggingEdges.y === WorktableStateResizingItemEdgeY.Top) {
        const initialItemRightPx = initialItemRectPx.yPx + initialItemRectPx.hPx;
        newRectPx.hPx = clamp(initialItemRectPx.hPx - deltaPx.y, minHPx, initialItemRightPx);
        newRectPx.yPx = clamp(initialItemRectPx.yPx + deltaPx.y, 0, initialItemRightPx - minHPx);
      } else {
        newRectPx.hPx = Math.max(initialItemRectPx.hPx + deltaPx.y, minHPx);
      }
    }

    onResize(deltaUnits);
    setResizing(prev => (prev ? {
      ...prev,
      rectPx: newRectPx
    } : null));
  }, [
    isResizing, colWidth, rowHeight, resizing,
    onResize, resizingMinSize
  ])

  const onResizeMouseUpHandler = useCallback((evt: MouseEvent) => {
    if (!isResizing) {
      return;
    }

    const {deltaUnits} = calcDeltasForMouseEvent(
      evt,
      resizing.fromPointPx,
      colWidth,
      rowHeight,
      resizing.draggingEdges.x === WorktableStateResizingItemEdgeX.Left ? -1 : 1,
      resizing.draggingEdges.y === WorktableStateResizingItemEdgeY.Top ? -1 : 1
    );

    onResizeEnd(deltaUnits);
    setResizing(null);
  }, [isResizing, resizing, colWidth, rowHeight, onResizeEnd])

  const onResizeMouseDownHandler = useCallback((evt: ReactMouseEvent<HTMLDivElement>, handleId: ResizeHandleId) => {
    evt.preventDefault();
    evt.stopPropagation();

    onResizeStart(id, resizeEdgesByHandleId[handleId]);
    setResizing({
      initialItemRectUnits: {x, y, w, h},
      draggingEdges: resizeEdgesByHandleId[handleId],
      fromPointPx: {
        xPx: evt.pageX,
        yPx: evt.pageY
      },
      rectPx
    })
  }, [rectPx, x, y, w, h, id, onResizeStart])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', onResizeMouseMoveHandler);
    }
    return () => {
      window.removeEventListener('mousemove', onResizeMouseMoveHandler);
    }
  }, [isResizing, onResizeMouseMoveHandler])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mouseup', onResizeMouseUpHandler);
    }
    return () => {
      window.removeEventListener('mouseup', onResizeMouseUpHandler);
    }
  }, [isResizing, onResizeMouseUpHandler])

  const maximizeAction: ActionBarItem = useMemo(() => ({
    enabled: true,
    icon: maximized ? unmaximize14Svg : maximize14Svg,
    id: 'MAXIMIZE',
    title: maximized ? 'Unmaximize' : 'Maximize',
    doAction: async () => {
      setMaximized(!maximized);
    }
  }), [maximized])

  return {
    env,
    widgetId,
    isEditable,
    isDragging,
    isResizing,
    rectPx,
    onDragStartHandler,
    onDragEndHandler,
    onResizeMouseDownHandler,
    maximizeAction,
    isMaximized,
  }
}
