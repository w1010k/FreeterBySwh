/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {manage24Svg} from '@/ui/assets/images/appIcons';
import {UITheme} from '@/ui/components/app/uiTheme/uiTheme';
import {InAppNote} from '@/ui/components/basic/inAppNote';
import {SvgIcon} from '@/ui/components/basic/svgIcon';
import clsx from 'clsx';
import React, {useCallback, useRef, useState} from 'react';
import styles from './app.module.scss';
import {AppViewModelHook} from './appViewModel';
import './globals.scss';

type Deps = {
  TopBar: React.FC;
  WorkflowSwitcher: React.FC;
  Worktable: React.FC;
  useAppViewModel: AppViewModelHook;
}

export function createAppComponent({
                                     TopBar,
                                     WorkflowSwitcher,
                                     Worktable,
                                     useAppViewModel
                                   }: Deps) {
  function App() {
    const {
      modalScreens, hasModalScreens, hasProjects, contextMenuHandler, uiThemeId, hasTopBar,
      workflowBarPos, workflowBarWidth, editMode, setWorkflowBarWidth
    } = useAppViewModel();
    const body = hasProjects
      ? <Worktable/>
      : <InAppNote className={styles['no-projects']}>
        {'You don\'t have any projects. Use the Manage Projects '} <SvgIcon svg={manage24Svg}
                                                                            className={styles['manage-icon']}/> {' button (or the View menu) to create a first one.'}
      </InAppNote>;
    const isSide = workflowBarPos === 'left' || workflowBarPos === 'right';

    // While dragging, an overlay covers the whole window (incl. any <webview>
    // widgets) so mousemove/mouseup keep firing in the host document — Electron
    // webviews otherwise swallow those events when the cursor passes over them.
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef<{ startX: number; startWidth: number; dir: number } | null>(null);
    const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
      // Only the primary button drags; right/middle presses are left alone.
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startWidth: workflowBarWidth,
        dir: workflowBarPos === 'right' ? -1 : 1
      };
      setIsResizing(true);
      // One abort removes every drag listener, whichever way the drag ends.
      const listeners = new AbortController();
      const endDrag = () => {
        dragRef.current = null;
        setIsResizing(false);
        listeners.abort();
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
        setWorkflowBarWidth(drag.startWidth + drag.dir * (ev.clientX - drag.startX));
      };
      window.addEventListener('mousemove', onMove, {signal: listeners.signal});
      window.addEventListener('mouseup', endDrag, {signal: listeners.signal});
      // Losing focus (Alt+Tab, the global hotkey hiding the window) can swallow
      // the mouseup, which would leave the capture overlay eating the next click.
      window.addEventListener('blur', endDrag, {signal: listeners.signal});
    }, [workflowBarWidth, workflowBarPos, setWorkflowBarWidth]);

    return (
      <div onContextMenu={contextMenuHandler}>
        <UITheme themeId={uiThemeId}/>
        <div className={styles['main-screen']}
             data-testid="main-screen" {...{inert: hasModalScreens ? true : undefined}}>
          {hasTopBar && <TopBar/>}
          {/* One tree for every bar position: only the flex direction changes
              (CSS), so switching positions never remounts the Worktable and its
              webview widgets don't reload. Children keep fixed slots (the
              resizer slot is `false` when unused) for the same reason. */}
          <div className={clsx(styles['body-layout'], styles[`is-${workflowBarPos}`])}>
            <WorkflowSwitcher/>
            {isSide && editMode && <div
              className={styles['workflow-bar-resizer']}
              onMouseDown={onResizerMouseDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize workflow bar"
            />}
            {body}
          </div>
        </div>
        {
          modalScreens.map(scr => (
            scr && <div key={scr.id} data-testid="modal-screen" {...{inert: !scr.isLast ? true : undefined}}>
              {scr.comp}
            </div>
          ))
        }
        {isResizing && <div className={styles['resize-overlay']} data-testid="resize-overlay"/>}
      </div>
    )
  }

  return App;
}
