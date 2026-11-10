/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ActionBarItems } from '@/base/actionBar';
import { EntityId } from '@/base/entity';
import { Project } from '@/base/project';
import { arrDown14Svg, arrUp14Svg, delete14Svg, duplicate14Svg } from '@/ui/assets/images/appIcons';
import { DragEvent, MouseEvent, useCallback, useMemo } from 'react';

export type ProjectManagerListItemOnMouseEvent = (evt: MouseEvent<HTMLElement>, projectId: EntityId) => void;
export type ProjectManagerListItemOnDragEvent = (evt: DragEvent<HTMLElement>, projectId: EntityId) => void;
export type ProjectManagerListItemProjectAction = (itemId: EntityId) => void;
/** One place up (-1) or down (1): the keyboard and button way to do what dragging an item does. */
export type ProjectManagerListItemMoveAction = (itemId: EntityId, offset: -1 | 1) => void;

export interface ProjectManagerListItemProps {
  project: Project;
  isCurrent: boolean;
  hasDeletionMark: boolean;
  isDropArea: boolean;
  onClick: ProjectManagerListItemOnMouseEvent;
  onDragStart: ProjectManagerListItemOnDragEvent;
  onDragEnd: ProjectManagerListItemOnDragEvent;
  onDragEnter: ProjectManagerListItemOnDragEvent;
  onDragLeave: ProjectManagerListItemOnDragEvent;
  onDragOver: ProjectManagerListItemOnDragEvent;
  onDrop: ProjectManagerListItemOnDragEvent;
  duplicateProjectAction: ProjectManagerListItemProjectAction;
  deleteProjectAction: ProjectManagerListItemProjectAction;
  moveProjectAction: ProjectManagerListItemMoveAction;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function useProjectManagerListItemViewModel(props: ProjectManagerListItemProps) {
  const {
    isCurrent,
    hasDeletionMark,
    onClick,
    project,
    deleteProjectAction,
    duplicateProjectAction,
    moveProjectAction,
    canMoveUp,
    canMoveDown,
    isDropArea,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDragStart,
    onDrop,
  } = props;
  const { id } = project;
  const { name } = project.settings;

  const onClickHandler = useCallback((evt: MouseEvent<HTMLElement>) => {
    onClick(evt, id)
  }, [onClick, id])

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

  // The list re-renders in the new order; keep the keyboard focus on the button pressed (the same DOM node, moved),
  // or on the item once that button turns disabled at an end of the list.
  const moveKeepingFocus = useCallback((offset: -1 | 1) => {
    const pressed = document.activeElement;
    moveProjectAction(id, offset);
    setTimeout(() => {
      if (pressed instanceof HTMLButtonElement && pressed.isConnected) {
        // The item (the draggable row) holds the tab next to its action bar.
        (pressed.disabled ? pressed.closest('[draggable]')?.querySelector<HTMLElement>('[role="tab"]') : pressed)?.focus();
      }
    });
  }, [id, moveProjectAction])

  const actionBarItems = useMemo<ActionBarItems>(() => [{
    enabled: canMoveUp,
    icon: arrUp14Svg,
    id: 'MOVE-PROJECT-UP',
    title: 'Move Up',
    doAction: async () => {
      moveKeepingFocus(-1);
    }
  }, {
    enabled: canMoveDown,
    icon: arrDown14Svg,
    id: 'MOVE-PROJECT-DOWN',
    title: 'Move Down',
    doAction: async () => {
      moveKeepingFocus(1);
    }
  }, {
    enabled: true,
    icon: duplicate14Svg,
    id: 'DUPLICATE-PROJECT',
    title: 'Duplicate Project',
    doAction: async () => {
      duplicateProjectAction(id);
    }
  }, {
    enabled: true,
    pressed: hasDeletionMark,
    icon: delete14Svg,
    id: 'DELETE-PROJECT',
    title: 'Delete Project',
    doAction: async () => {
      deleteProjectAction(id);
    }
  }], [hasDeletionMark, duplicateProjectAction, id, deleteProjectAction, moveKeepingFocus, canMoveUp, canMoveDown])

  return {
    name,
    isCurrent,
    isDropArea,
    hasDeletionMark,
    actionBarItems,
    onClickHandler,
    onDragStartHandler,
    onDragEndHandler,
    onDragEnterHandler,
    onDragLeaveHandler,
    onDragOverHandler,
    onDropHandler,
  };
}
