/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ShelfItemProps, useShelfItemViewModel } from '@/ui/components/topBar/shelf/shelfItemViewModel';
import { WidgetComponent } from '@/ui/components/widget';
import clsx from 'clsx';
import styles from './shelf.module.scss';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

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
      measureItemElRect,
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
    // Detaches the window-level drag listeners. Held in a ref so that an unmount
    // mid-drag (before mouseup fires) can still remove them — otherwise the
    // listeners would leak past the component's lifetime.
    const detachResizeRef = useRef<(() => void) | null>(null);
    const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startY: e.clientY, startW: widgetBoxWidth, startH: widgetBoxHeight };
      setIsResizing(true);
      // One abort removes *this* drag's listeners, whichever way the drag ends,
      // so overlapping drags can't leave a stray set attached.
      const listeners = new AbortController();
      const endDrag = () => {
        dragRef.current = null;
        setIsResizing(false);
        listeners.abort();
        detachResizeRef.current = null;
      };
      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) {
          return;
        }
        // The button was released where we never saw the mouseup (e.g. focus
        // left the window mid-drag): end the drag instead of following the cursor.
        if ((ev.buttons & 1) === 0) {
          endDrag();
          return;
        }
        onResizeHandler(drag.startW + (ev.clientX - drag.startX), drag.startH + (ev.clientY - drag.startY));
      };
      window.addEventListener('mousemove', onMove, {signal: listeners.signal});
      window.addEventListener('mouseup', endDrag, {signal: listeners.signal});
      // Losing focus (Alt+Tab, the global hotkey hiding the window) can swallow
      // the mouseup, which would leave the capture overlay eating the next click.
      window.addEventListener('blur', endDrag, {signal: listeners.signal});
      detachResizeRef.current = () => listeners.abort();
    }, [widgetBoxWidth, widgetBoxHeight, onResizeHandler]);

    // Safety net: drop any still-attached drag listeners if we unmount mid-drag.
    useEffect(() => () => detachResizeRef.current?.(), []);

    return (
      <li
        className={clsx(
          styles['shelf-item'],
          // isDragging && styles['is-dragging'],
          isDropArea && styles['is-drop-area'],
          isResizing && styles['is-resizing'],
        )}
        onContextMenu={onContextMenuHandler}
        // Re-measure the tab's position right before the popup opens, so it
        // tracks the current layout. A ResizeObserver only catches size changes,
        // missing the horizontal shift when a sibling tab is deleted/added.
        onMouseEnter={measureItemElRect}
        onFocus={measureItemElRect}
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
