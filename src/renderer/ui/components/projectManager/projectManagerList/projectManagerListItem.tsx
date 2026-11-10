/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBar } from '@/ui/components/basic/actionBar';
import styles from './projectManagerListItem.module.scss';
import { ProjectManagerListItemProps, useProjectManagerListItemViewModel } from '@/ui/components/projectManager/projectManagerList/projectManagerListItemViewModel';
import clsx from 'clsx';

export function ProjectManagerListItem(props: ProjectManagerListItemProps) {
  const {
    isCurrent,
    hasDeletionMark,
    onClickHandler,
    isDropArea,
    onDragEndHandler,
    onDragEnterHandler,
    onDragLeaveHandler,
    onDragOverHandler,
    onDragStartHandler,
    onDropHandler,
    name,
    actionBarItems,
  } = useProjectManagerListItemViewModel(props);

  return (
    // The tab holds only the name: a tab's content is presentational, so the action buttons sit next to it, not in it.
    <div
      className={clsx(styles['project-list-item'], isCurrent && styles['is-current'], isDropArea && styles['is-drop-area'])}
      draggable={true}
      onClick={onClickHandler}
      onDragStart={onDragStartHandler}
      onDragEnd={onDragEndHandler}
      onDragEnter={onDragEnterHandler}
      onDragLeave={onDragLeaveHandler}
      onDragOver={onDragOverHandler}
      onDrop={onDropHandler}
    >
      <a
        className={styles['project-list-item-name']}
        role="tab"
        href=""
        aria-selected={isCurrent}
        draggable={false}
      >{name}</a>
      <ActionBar
        actionBarItems={actionBarItems}
        ariaLabel={`${name} actions`}
        className={clsx(styles['project-list-item-action-bar'], hasDeletionMark && styles['always-visible'])}
      ></ActionBar>
    </div>
  )
}
