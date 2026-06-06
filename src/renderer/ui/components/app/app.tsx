/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppViewModelHook } from './appViewModel';
import './globals.scss';
import React, { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './app.module.scss';
import {SvgIcon} from '@/ui/components/basic/svgIcon';
import { manage24Svg } from '@/ui/assets/images/appIcons';
import { InAppNote } from '@/ui/components/basic/inAppNote';
import { UITheme } from '@/ui/components/app/uiTheme/uiTheme';

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
      workflowBarPos, workflowBarWidth, setWorkflowBarWidth
    } = useAppViewModel();
    const body = hasProjects
      ? <Worktable />
      : <InAppNote className={styles['no-projects']}>
          {'You don\'t have any projects. Use the Manage Projects '} <SvgIcon svg={manage24Svg} className={styles['manage-icon']} /> {' button above (or under the View menu) to create a first one.'}
        </InAppNote>;
    const isSide = workflowBarPos === 'left' || workflowBarPos === 'right';

    // While dragging, an overlay covers the whole window (incl. any <webview>
    // widgets) so mousemove/mouseup keep firing in the host document — Electron
    // webviews otherwise swallow those events when the cursor passes over them.
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef<{ startX: number; startWidth: number; dir: number } | null>(null);
    const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startWidth: workflowBarWidth,
        dir: workflowBarPos === 'right' ? -1 : 1
      };
      setIsResizing(true);
      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) {
          return;
        }
        setWorkflowBarWidth(drag.startWidth + drag.dir * (ev.clientX - drag.startX));
      };
      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, [workflowBarWidth, workflowBarPos, setWorkflowBarWidth]);

    return (
      <div onContextMenu={contextMenuHandler}>
        <UITheme themeId={uiThemeId} />
        <div className={styles['main-screen']} data-testid="main-screen" {...{ inert: hasModalScreens ? true : undefined }}>
          {hasTopBar && <TopBar />}
          {isSide
            ? <div className={clsx(styles['body-row'], workflowBarPos === 'right' && styles['is-right'])}>
                <WorkflowSwitcher />
                <div
                  className={styles['workflow-bar-resizer']}
                  onMouseDown={onResizerMouseDown}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize workflow bar"
                />
                {body}
              </div>
            : <>
                {workflowBarPos === 'bottom' ? body : <WorkflowSwitcher />}
                {workflowBarPos === 'bottom' ? <WorkflowSwitcher /> : body}
              </>
          }
        </div>
        {
          modalScreens.map(scr => (
            scr && <div key={scr.id} data-testid="modal-screen" {...{ inert: !scr.isLast ? true : undefined }}>
              {scr.comp}
            </div>
          ))
        }
        {isResizing && <div className={styles['resize-overlay']} data-testid="resize-overlay" />}
      </div>
    )
  }
  return App;
}
