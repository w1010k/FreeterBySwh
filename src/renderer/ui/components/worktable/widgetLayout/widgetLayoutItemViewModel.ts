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
  itemXDeltaPxToUnits,
  itemYDeltaPxToUnits
} from '@/ui/components/worktable/widgetLayout/calcs';
import {resizeEdgesByHandleId, ResizeHandleId} from '@/ui/components/worktable/widgetLayout/resizeHandles';
import {RectPx, WHPx, XYPx} from '@/ui/types/dimensions';
import {DragEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';

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
    x: itemXDeltaPxToUnits(deltaPx.x, colWidth) * xMulti,
    y: itemYDeltaPxToUnits(deltaPx.y, rowHeight) * yMulti
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

  // The maximized tile covers the visible viewport, so it is offset by the
  // worktable's scroll position at the moment it gets maximized (again after
  // leaving edit mode). The worktable can't scroll while a tile is maximized
  // (`overflow: hidden`), so one read per transition stays correct. A layout
  // effect measures before paint, so the tile never flashes at a stale offset.
  useLayoutEffect(() => {
    if (isMaximized && viewportElRef.current) {
      setScrollTop(viewportElRef.current.scrollTop);
    }
  }, [isMaximized, viewportElRef]);

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

  // The window listeners of a resize drag are attached once, on mousedown, and
  // read the in-progress state and the latest render values through refs.
  // Closing over them instead would re-attach the listeners on every mousemove.
  const resizingRef = useRef<ResizingState | null>(null);
  const lastDeltaUnitsRef = useRef<{ x: number, y: number }>({x: 0, y: 0});
  const latestRef = useRef({colWidth, rowHeight, resizingMinSize, onResize, onResizeEnd});
  useEffect(() => {
    latestRef.current = {colWidth, rowHeight, resizingMinSize, onResize, onResizeEnd};
  });
  // Detaches the current drag's window listeners; also used if we unmount mid-drag.
  const detachResizeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachResizeRef.current?.(), []);

  const onResizeMouseMove = useCallback((evt: MouseEvent) => {
    const resizing = resizingRef.current;
    if (!resizing) {
      return;
    }
    const {colWidth, rowHeight, resizingMinSize, onResize} = latestRef.current;

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

    lastDeltaUnitsRef.current = deltaUnits;
    onResize(deltaUnits);
    const next = {...resizing, rectPx: newRectPx};
    resizingRef.current = next;
    setResizing(next);
  }, [])

  const onResizeMouseDownHandler = useCallback((evt: ReactMouseEvent<HTMLDivElement>, handleId: ResizeHandleId) => {
    // Only the primary button resizes; the drag ends once it is no longer held.
    if (evt.button !== 0) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();

    const start: ResizingState = {
      initialItemRectUnits: {x, y, w, h},
      draggingEdges: resizeEdgesByHandleId[handleId],
      fromPointPx: {
        xPx: evt.pageX,
        yPx: evt.pageY
      },
      rectPx
    };
    onResizeStart(id, start.draggingEdges);
    resizingRef.current = start;
    lastDeltaUnitsRef.current = {x: 0, y: 0};
    setResizing(start);

    // One abort removes every drag listener, whichever way the drag ends.
    const listeners = new AbortController();
    // Commits the resize. With a mouseup we take its position; without one
    // (focus lost, button released where we couldn't see it) we commit the last
    // delta the user saw in the preview.
    const endDrag = (upEvt?: MouseEvent) => {
      const resizing = resizingRef.current;
      if (!resizing) {
        return;
      }
      const {colWidth, rowHeight, onResizeEnd} = latestRef.current;
      const deltaUnits = upEvt
        ? calcDeltasForMouseEvent(
          upEvt,
          resizing.fromPointPx,
          colWidth,
          rowHeight,
          resizing.draggingEdges.x === WorktableStateResizingItemEdgeX.Left ? -1 : 1,
          resizing.draggingEdges.y === WorktableStateResizingItemEdgeY.Top ? -1 : 1
        ).deltaUnits
        : lastDeltaUnitsRef.current;
      resizingRef.current = null;
      listeners.abort();
      detachResizeRef.current = null;
      onResizeEnd(deltaUnits);
      setResizing(null);
    };
    window.addEventListener('mousemove', (ev: MouseEvent) => {
      if ((ev.buttons & 1) === 0) {
        endDrag();
      } else {
        onResizeMouseMove(ev);
      }
    }, {signal: listeners.signal});
    window.addEventListener('mouseup', (ev: MouseEvent) => endDrag(ev), {signal: listeners.signal});
    // Losing focus (Alt+Tab, the global hotkey hiding the window) can swallow
    // the mouseup, which would leave `resizingItem` set and the action bars hidden.
    window.addEventListener('blur', () => endDrag(), {signal: listeners.signal});
    detachResizeRef.current = () => listeners.abort();
  }, [rectPx, x, y, w, h, id, onResizeStart, onResizeMouseMove])

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
