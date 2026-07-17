/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import styles from './appManagerList.module.scss';
import { Button } from '@/ui/components/basic/button';
import { AppManagerListItem } from '@/ui/components/appManager/appManagerList/appManagerListItem';
import { AppManagerListProps, useAppManagerListViewModel } from '@/ui/components/appManager/appManagerList/appManagerListViewModel';
import { useState } from 'react';

export function AppManagerList(props: AppManagerListProps) {
  const {
    appList,
    currentAppId,
    draggingOverAppId,
    onListItemClick,
    onListItemDragEnd,
    onListItemDragEnter,
    onListItemDragLeave,
    onListItemDragOver,
    onListItemDragStart,
    onListItemDrop,
    onAddAppClick,
    deleteAppAction,
    duplicateAppAction,
    deleteAppIds,
  } = useAppManagerListViewModel(props);

  // Presentational name filter, local to the component. Note: drag-reorder
  // while a filter is active reorders relative to the visible items only.
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleList = query === '' ? appList : appList.filter(item => item.settings.name.toLowerCase().includes(query));

  return (<div role="tablist">
    {appList.length > 1 && <input
      type="text"
      className={styles['app-list-search']}
      placeholder="Search apps"
      aria-label="Search apps"
      value={search}
      onChange={e => setSearch(e.target.value)}
    />}
    {appList.length === 0 && <div className={styles['app-list-note']}>No apps yet — use “Add App” below to create one.</div>}
    {appList.length > 0 && visibleList.length === 0 && <div className={styles['app-list-note']}>No apps found</div>}
    {visibleList.map(item=>(
      <AppManagerListItem
        isCurrent={currentAppId===item.id}
        isDropArea={draggingOverAppId===item.id}
        hasDeletionMark={deleteAppIds[item.id]}
        onClick={onListItemClick}
        onDragEnd={onListItemDragEnd}
        onDragEnter={onListItemDragEnter}
        onDragLeave={onListItemDragLeave}
        onDragOver={onListItemDragOver}
        onDragStart={onListItemDragStart}
        onDrop={onListItemDrop}
        app={item}
        key={item.id}
        deleteAppAction={deleteAppAction}
        duplicateAppAction={duplicateAppAction}
      ></AppManagerListItem>
    ))}
    <div className={styles['app-list-actions']}>
      <Button
        caption='Add App'
        onClick={e=>onAddAppClick(e)}
        size='L'
        primary={true}
      ></Button>
    </div>
  </div>)
}
