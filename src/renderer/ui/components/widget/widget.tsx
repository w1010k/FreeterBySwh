/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBar } from '@/ui/components/basic/actionBar';
import { SvgIcon } from '@/ui/components/basic/svgIcon';
import { WidgetProps, WidgetViewModelHook } from '@/ui/components/widget/widgetViewModel';
import styles from './widget.module.scss';
import clsx from 'clsx';
import { memo, useEffect, useRef } from 'react';
import { WidgetErrorBoundary } from './widgetErrorBoundary';

type Deps = {
  useWidgetViewModel: WidgetViewModelHook;
}

export function createWidgetComponent({
  useWidgetViewModel
}: Deps) {
  function Component(props: WidgetProps) {

    const {
      editMode,
      env,
      widget,
      actionBarItems,
      widgetName,
      headerTabs,
      widgetApi,
      WidgetComp,
      sharedState,
      dontShowActionBar,
      onContextMenuHandler,
    } = useWidgetViewModel(props);

    // The tab bar hides its scrollbar (26px header), so overflowed tabs need
    // the active one scrolled into view and the vertical wheel mapped to
    // horizontal scroll — otherwise they're unreachable with a mouse.
    const headerTabsRef = useRef<HTMLDivElement>(null);
    const activeTabIdx = headerTabs?.active;
    const tabCount = headerTabs?.tabs.length;
    useEffect(() => {
      const el = activeTabIdx !== undefined ? headerTabsRef.current?.children[activeTabIdx] : undefined;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({block: 'nearest', inline: 'nearest'});
      }
    }, [activeTabIdx, tabCount]);

    if (!widget) {
      return <div>Widget instance does not exist</div>
    }

    if (!WidgetComp) {
      return <div>
        <div>Unknown widget type</div>
        {editMode && <ActionBar actionBarItems={actionBarItems}></ActionBar>}
      </div>
    }

    if (env.isPreview) {
      return (
        <WidgetErrorBoundary resetKey={widget.settings}>
          <WidgetComp id={widget.id} env={env} settings={widget.settings} widgetApi={widgetApi} sharedState={sharedState}></WidgetComp>
        </WidgetErrorBoundary>
      )
    }

    return <div
      className={clsx(styles.widget, dontShowActionBar && styles['dont-show-action-bar'])}
      data-widget-type={widget.type}
      onContextMenu={onContextMenuHandler}
    >
      <div className={styles['widget-header']}>
        {/* In edit mode the header is the drag handle, so tabs yield to the name. */}
        {(!editMode && headerTabs && headerTabs.tabs.length > 0)
          ? <div className={styles['widget-header-tabs-bar']}>
            <div
              className={styles['widget-header-tabs']}
              role="tablist"
              ref={headerTabsRef}
              onWheel={e => { e.currentTarget.scrollLeft += e.deltaY + e.deltaX; }}
            >
              {headerTabs.tabs.map((tab, i) => {
                const onClose = headerTabs.onClose;
                const tabButton = (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === headerTabs.active}
                    title={tab.title}
                    className={clsx(styles['widget-header-tab'], !onClose && i === headerTabs.active && styles['widget-header-tab-active'])}
                    onClick={() => headerTabs.onSelect(i)}
                    onKeyDown={onClose ? e => {
                      if (e.key === 'Delete') {
                        onClose(i);
                      }
                    } : undefined}
                    aria-keyshortcuts={onClose ? 'Delete' : undefined}
                  >
                    {/* While loading, a spinner takes the favicon's slot (browser-tab convention). */}
                    {tab.loading
                      ? <span className={styles['widget-header-tab-spinner']} role="progressbar" aria-label="Loading"></span>
                      : tab.icon && <img className={styles['widget-header-tab-icon']} src={tab.icon} alt="" />}
                    <span className={styles['widget-header-tab-label']}>{tab.label}</span>
                    {tab.audioIcon && <SvgIcon svg={tab.audioIcon} className={styles['widget-header-tab-audio']}></SvgIcon>}
                  </button>
                );
                // A tab list holds tabs only: the x is a mouse target hidden from assistive tech, and the
                // tab itself closes with Delete (aria-keyshortcuts).
                return onClose
                  ? <span key={i} role="none" className={clsx(styles['widget-header-tab-wrap'], i === headerTabs.active && styles['widget-header-tab-active'])}>
                      {tabButton}
                      <span
                        aria-hidden="true"
                        className={styles['widget-header-tab-close']}
                        title={`Close ${tab.label}`}
                        onClick={() => onClose(i)}
                      >×</span>
                    </span>
                  : tabButton;
              })}
            </div>
            {headerTabs.onAdd && (
              <button
                type="button"
                className={styles['widget-header-tab-add']}
                aria-label={headerTabs.addTitle ?? 'Add'}
                title={headerTabs.addTitle ?? 'Add'}
                onClick={headerTabs.onAdd}
              >+</button>
            )}
          </div>
          : <div className={styles['widget-header-name']}>{widgetName}</div>}
        <ActionBar
          actionBarItems={actionBarItems}
          className={styles['widget-header-action-bar']}
        ></ActionBar>
      </div>
      <div className={styles['widget-body']} data-widget-context="" {...{ inert: editMode ? true : undefined }}>
        {/* A crash in one widget must not take down the others. */}
        <WidgetErrorBoundary resetKey={widget.settings}>
          <WidgetComp id={widget.id} env={env} settings={widget.settings} widgetApi={widgetApi} sharedState={sharedState}></WidgetComp>
        </WidgetErrorBoundary>
      </div>
    </div>
  }

  return memo(Component);
}

export type WidgetComponent = ReturnType<typeof createWidgetComponent>;
