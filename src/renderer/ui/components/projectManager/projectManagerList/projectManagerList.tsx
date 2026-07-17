/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import styles from './projectManagerList.module.scss';
import { Button } from '@/ui/components/basic/button';
import { ProjectManagerListItem } from '@/ui/components/projectManager/projectManagerList/projectManagerListItem';
import { ProjectManagerListProps, useProjectManagerListViewModel } from '@/ui/components/projectManager/projectManagerList/projectManagerListViewModel';
import { useState } from 'react';

export function ProjectManagerList(props: ProjectManagerListProps) {
  const {
    projectList,
    currentProjectId,
    draggingOverProjectId,
    onListItemClick,
    onListItemDragEnd,
    onListItemDragEnter,
    onListItemDragLeave,
    onListItemDragOver,
    onListItemDragStart,
    onListItemDrop,
    onAddProjectClick,
    deleteProjectAction,
    deleteProjectIds,
    duplicateProjectAction,
  } = useProjectManagerListViewModel(props);

  // Presentational name filter, local to the component. Note: drag-reorder
  // while a filter is active reorders relative to the visible items only.
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleList = query === '' ? projectList : projectList.filter(item => item.settings.name.toLowerCase().includes(query));

  return (<div role="tablist">
    {projectList.length > 1 && <input
      type="text"
      className={styles['project-list-search']}
      placeholder="Search projects"
      aria-label="Search projects"
      value={search}
      onChange={e => setSearch(e.target.value)}
    />}
    {projectList.length === 0 && <div className={styles['project-list-note']}>No projects yet — use “Add Project” below to create one.</div>}
    {projectList.length > 0 && visibleList.length === 0 && <div className={styles['project-list-note']}>No projects found</div>}
    {visibleList.map(item=>(
      <ProjectManagerListItem
        isCurrent={currentProjectId===item.id}
        isDropArea={draggingOverProjectId===item.id}
        hasDeletionMark={deleteProjectIds[item.id]}
        onClick={onListItemClick}
        onDragEnd={onListItemDragEnd}
        onDragEnter={onListItemDragEnter}
        onDragLeave={onListItemDragLeave}
        onDragOver={onListItemDragOver}
        onDragStart={onListItemDragStart}
        onDrop={onListItemDrop}
        project={item}
        key={item.id}
        deleteProjectAction={deleteProjectAction}
        duplicateProjectAction={duplicateProjectAction}
      ></ProjectManagerListItem>
    ))}
    <div className={styles['project-list-actions']}>
      <Button
        caption='Add Project'
        onClick={e=>onAddProjectClick(e)}
        size='L'
        primary={true}
      ></Button>
    </div>
  </div>)
}
