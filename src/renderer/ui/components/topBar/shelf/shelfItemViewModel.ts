/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { EntityId } from '@/base/entity';
import { Widget, WidgetEnvAreaShelf } from '@/base/widget';
import { WidgetType } from '@/base/widgetType';
import { useElementRect } from '@/ui/hooks';
import { useWindowSize } from '@/ui/hooks/useWindowSize';
import { CSSProperties, DragEvent, MouseEvent, useCallback, useMemo } from 'react';
import { shelfWidgetDefaultH, shelfWidgetDefaultW } from '@/application/useCases/shelf/setShelfItemSize';

export interface ShelfItemProps {
  id: EntityId;
  env: WidgetEnvAreaShelf;
  widget?: Widget;
  widgetType?: WidgetType;
  isEditMode: boolean;
  isDragging: boolean;
  isDropArea: boolean;
  w?: number;
  h?: number;
  onContextMenu: (evt: MouseEvent<HTMLElement>, itemId: EntityId) => void;
  onDragStart: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onDragEnd: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onDragEnter: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onDragLeave: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onDragOver: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onDrop: (evt: DragEvent<HTMLElement>, itemId: EntityId) => void;
  onResize: (itemId: EntityId, w: number, h: number) => void;
}

export function useShelfItemViewModel(props: ShelfItemProps) {
  const {
    env, widget, widgetType, id, isEditMode, isDragging, isDropArea, w, h,
    onDragStart, onDragEnd, onDragEnter, onDragLeave, onDragOver,
    onDrop, onContextMenu, onResize
  } = props;

  const widgetName = widget?.coreSettings.name || widgetType?.name || '';
  const onDragStartHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    onDragStart(evt, id);
  }, [id, onDragStart])

  const onDragEndHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    onDragEnd(evt, id);
  }, [id, onDragEnd])

  const onDragEnterHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    evt.stopPropagation();
    onDragEnter(evt, id);
  }, [id, onDragEnter])

  const onDragLeaveHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    evt.stopPropagation();
    onDragLeave(evt, id);
  }, [id, onDragLeave])

  const onDragOverHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    evt.stopPropagation();
    onDragOver(evt, id);
  }, [id, onDragOver])

  const onDropHandler = useCallback((evt: DragEvent<HTMLElement>) => {
    evt.stopPropagation();
    onDrop(evt, id);
  }, [id, onDrop])

  const onContextMenuHandler = useCallback((evt: MouseEvent<HTMLElement>) => {
    evt.stopPropagation();
    onContextMenu(evt, id);
  }, [id, onContextMenu])


  const [itemElRef, itemElRect, measureItemElRect] = useElementRect({ useViewportRect: true });

  const wPx = typeof w === 'number' ? w : shelfWidgetDefaultW;
  const hPx = typeof h === 'number' ? h : shelfWidgetDefaultH;

  const windowSize = useWindowSize();
  const itemWidgetElRectStyle = useMemo(() => {
    let xPx = itemElRect.xPx;
    if (xPx + wPx > windowSize.wPx) {
      xPx = windowSize.wPx - wPx;
    }
    if (xPx < 0) {
      xPx = 0;
    }

    return {
      left: xPx + 'px',
      width: wPx + 'px',
      height: hPx + 'px'
    } as CSSProperties;
  }, [itemElRect.xPx, windowSize.wPx, wPx, hPx])

  const onResizeHandler = useCallback((newW: number, newH: number) => {
    onResize(id, newW, newH);
  }, [id, onResize])

  return {
    env,
    widget,
    widgetName,
    isEditMode,
    isDragging,
    isDropArea,
    widgetBoxWidth: wPx,
    widgetBoxHeight: hPx,
    itemWidgetElRef: itemElRef,
    itemWidgetElRectStyle,
    measureItemElRect,
    onContextMenuHandler,
    onDragStartHandler,
    onDragEndHandler,
    onDragEnterHandler,
    onDragLeaveHandler,
    onDragOverHandler,
    onDropHandler,
    onResizeHandler,
  }
}
