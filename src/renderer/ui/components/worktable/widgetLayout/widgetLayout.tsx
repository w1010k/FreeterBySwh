/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {editMode24Svg} from '@/ui/assets/images/appIcons';
import {InAppNote} from '@/ui/components/basic/inAppNote';
import {SvgIcon} from '@/ui/components/basic/svgIcon';
import {WidgetLayoutItemComponent} from '@/ui/components/worktable/widgetLayout/widgetLayoutItem';
import WidgetLayoutItemGhost from '@/ui/components/worktable/widgetLayout/widgetLayoutItemGhost';
import {WidgetLayoutProps, WidgetLayoutViewModel} from '@/ui/components/worktable/widgetLayout/widgetLayoutViewModel';
import clsx from 'clsx';
import {memo, useMemo, useState} from 'react';
import {calcGridRowHeight, itemHUnitsToPx, itemYUnitsToPx} from '@/ui/components/worktable/widgetLayout/calcs';
import styles from './widgetLayout.module.scss';

type Deps = {
  WidgetLayoutItem: WidgetLayoutItemComponent,
  useWidgetLayoutViewModel: WidgetLayoutViewModel;
}

export function createWidgetLayoutComponent({
                                              WidgetLayoutItem,
                                              useWidgetLayoutViewModel
                                            }: Deps) {
  function WidgetLayoutComponent(props: WidgetLayoutProps) {
    const {
      componentMounted,
      env,
      isVisible,
      isEditMode,
      viewportElRef,
      viewportSize,
      viewLayoutItems,
      resizingItem,
      dndIsDropArea,
      dndDraggingLayoutItemId,
      ghostItemRect,
      showNoWidgetsNote,
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
      onItemDragStart,
      onItemDragEnd,
      onItemResizeStart,
      onItemResize,
      onItemResizeEnd,
      onContextMenu,
    } = useWidgetLayoutViewModel(props);

    // The scrollbar stays hidden (an upstream look, commit a8461d4), so a line at the bottom edge tells that widgets
    // sit below it. From the layout data and the scroll position, not scrollHeight:
    // item moves animate, so a measured scrollHeight lags. (The grid does not grow sideways: x + w <= cols.)
    const [scrollTop, setScrollTop] = useState(0);
    const rowHeightPx = calcGridRowHeight(viewportSize);
    const contentBottomPx = useMemo(() => Math.max(0, ...viewLayoutItems.map(
      item => itemYUnitsToPx(item.rect.y, rowHeightPx) + itemHUnitsToPx(item.rect.h, rowHeightPx)
    )), [viewLayoutItems, rowHeightPx]);
    const moreBelow = contentBottomPx > scrollTop + viewportSize.hPx + 1;

    return componentMounted.current ? (<>
      {isVisible && showNoWidgetsNote && (
        !isEditMode
          ? <InAppNote className={styles['no-widgets']}>
            {'The workflow is empty. Enable Edit Mode with '}
            <SvgIcon svg={editMode24Svg} className={styles['edit-mode-icon']}/>
            {' button (or the Edit menu) to edit it.'}
          </InAppNote>
          : <InAppNote className={styles['no-widgets']}>
            {'Click or drag a widget from Add Widget / Paste Widget to add it to the workflow.'}
          </InAppNote>
      )}
      <div
        className={clsx(styles.widgetLayout, dndIsDropArea && styles['is-drop-area'], isVisible && styles['is-visible'])}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        ref={viewportElRef as React.RefObject<HTMLDivElement | null>}
        onContextMenu={onContextMenu}
        // Each scroll re-renders the layout; the items are memo'd, so they do not re-render.
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        data-testid="widget-layout"
        {...{inert: !isVisible ? true : undefined}}
      >
        {ghostItemRect && <WidgetLayoutItemGhost
          w={ghostItemRect.w}
          h={ghostItemRect.h}
          x={ghostItemRect.x}
          y={ghostItemRect.y}
          viewportSize={viewportSize}
        />}
        {env && viewLayoutItems?.map(layoutItem => (
          <WidgetLayoutItem
            key={layoutItem.id}
            id={layoutItem.id}
            w={layoutItem.rect.w}
            h={layoutItem.rect.h}
            x={layoutItem.rect.x}
            y={layoutItem.rect.y}
            env={env}
            widgetId={layoutItem.widgetId}
            viewportSize={viewportSize}
            viewportElRef={viewportElRef}
            resizingMinSize={resizingItem?.minSize}
            isEditable={isEditMode}
            isDragging={layoutItem.id === dndDraggingLayoutItemId}
            onDragStart={onItemDragStart}
            onDragEnd={onItemDragEnd}
            onResizeStart={onItemResizeStart}
            onResize={onItemResize}
            onResizeEnd={onItemResizeEnd}
          />
        ))}
      </div>
      {isVisible && moreBelow && <div className={styles['more-below']} aria-hidden="true"/>}
    </>) : (
      <div
        className={styles.widgetLayout}
        ref={viewportElRef as React.RefObject<HTMLDivElement | null>}
      />
    )

  }

  return memo(WidgetLayoutComponent);
}
