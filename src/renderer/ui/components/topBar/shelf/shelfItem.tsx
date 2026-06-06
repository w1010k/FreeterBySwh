/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ShelfItemProps, useShelfItemViewModel } from '@/ui/components/topBar/shelf/shelfItemViewModel';
import { WidgetComponent } from '@/ui/components/widget';
import clsx from 'clsx';
import styles from './shelf.module.scss';
import { memo, useCallback, useRef, useState } from 'react';

type Deps = {
  Widget: WidgetComponent;
}

export function createShelfItemComponent({
  Widget
}: Deps) {
  function Component(props: ShelfItemProps) {
    const {
      widget,
      widgetName,
      env,
      isEditMode,
      // isDragging,
      isDropArea,
      widgetBoxWidth,
      widgetBoxHeight,
      itemWidgetElRef,
      itemWidgetElRectStyle,
      onContextMenuHandler,
      onDragStartHandler,
      onDragEndHandler,
      onDragEnterHandler,
      onDragLeaveHandler,
      onDragOverHandler,
      onDropHandler,
      onResizeHandler,
    } = useShelfItemViewModel(props);

    // Drag-resize the popup box (edit mode only). While dragging we keep the box
    // forced-visible (it is otherwise :hover-gated) and overlay the window so the
    // drag keeps tracking over <webview> widgets below.
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
    const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startY: e.clientY, startW: widgetBoxWidth, startH: widgetBoxHeight };
      setIsResizing(true);
      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) {
          return;
        }
        onResizeHandler(drag.startW + (ev.clientX - drag.startX), drag.startH + (ev.clientY - drag.startY));
      };
      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, [widgetBoxWidth, widgetBoxHeight, onResizeHandler]);

    return (
      <li
        className={clsx(
          styles['shelf-item'],
          // isDragging && styles['is-dragging'],
          isDropArea && styles['is-drop-area'],
          isResizing && styles['is-resizing'],
        )}
        onContextMenu={onContextMenuHandler}
        tabIndex={0}
        ref={itemWidgetElRef as React.RefObject<HTMLLIElement | null>}
      >
        <div
          className={styles['shelf-item-caption']}
          draggable={isEditMode}
          onDragStart={onDragStartHandler}
          onDragEnd={onDragEndHandler}
          onDragEnter={onDragEnterHandler}
          onDragLeave={onDragLeaveHandler}
          onDragOver={onDragOverHandler}
          onDrop={onDropHandler}
        >
          {widgetName}
        </div>
        <div
          className={styles['shelf-item-widget-box']}
          style={itemWidgetElRectStyle}
        >
          <div className={styles['shelf-item-widget']}>
            {widget && <Widget widget={widget} env={env} />}
          </div>
          {isEditMode && <div
            className={styles['shelf-item-resizer']}
            onMouseDown={onResizerMouseDown}
            role="separator"
            aria-label="Resize widget"
          />}
        </div>
        {isResizing && <div className={styles['shelf-resize-overlay']} />}
      </li>
    )
  }
  // Memoized for consistency with the other list items (WidgetLayoutItem, etc.):
  // skips re-renders when the parent re-renders for reasons unrelated to this item.
  return memo(Component);
}

export type ShelfItemComponent = ReturnType<typeof createShelfItemComponent>;
