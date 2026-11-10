/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback } from 'react';
import styles from './palette.module.scss';
import { SvgIcon } from '@/ui/components/basic/svgIcon';
import { MoreInfo } from '@/ui/components/basic/moreInfo';

export interface PaletteItemProps {
  id: string;
  icon: string;
  name: string;
  moreInfo?: string;
  onDragStart: (itemId: string) => void;
  onDragEnd: () => void;
  onClick: (itemId: string) => void;
  onContextMenu: (itemId: string) => void;
}

// Items are Tab stops, so a mouse press focuses them. That focus goes after a click, drag or right-click (a hidden but
// focused item would take the next Enter and add another widget); a keyboard focus (:focus-visible) stays.
function dropMouseFocus(el: HTMLElement) {
  if (!el.matches(':focus-visible')) {
    el.blur();
  }
}

const PaletteItemComponent = (props: PaletteItemProps) => {
  const { id, icon, name, moreInfo, onDragStart, onDragEnd, onClick, onContextMenu } = props;

  const onDragStartHandler = useCallback(() => {
    onDragStart(id);
  }, [id, onDragStart])

  const onDragEndHandler = useCallback((e: React.DragEvent<HTMLLIElement>) => {
    onDragEnd();
    dropMouseFocus(e.currentTarget);
  }, [onDragEnd])

  const onClickHandler = useCallback((e: React.MouseEvent<HTMLLIElement>) => {
    onClick(id);
    dropMouseFocus(e.currentTarget);
  }, [id, onClick])

  // Keyboard: Tab reaches each item, Enter or Space adds (or pastes) it, as a click does. Not a held key (it would add
  // one widget per repeat) and not with a modifier.
  const onKeyDownHandler = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      onClick(id);
    }
  }, [id, onClick])

  const onContextMenuHandler = useCallback((e: React.MouseEvent<HTMLLIElement>) => {
    onContextMenu(id);
    dropMouseFocus(e.currentTarget);
  }, [id, onContextMenu])

  return (
    <li
      className={styles['palette-item']}
      draggable={true}
      onDragStart={onDragStartHandler}
      onDragEnd={onDragEndHandler}
      onClick={onClickHandler}
      onContextMenu={onContextMenuHandler}
      tabIndex={0}
      onKeyDown={onKeyDownHandler}
      // The help is read with the item (one Tab stop per item, not two).
      aria-description={moreInfo}
    >
      <SvgIcon svg={icon} className={styles['palette-item-icon']}></SvgIcon>
      <span className={styles['palette-item-name']} title={name}>{name}</span>
      {moreInfo && <MoreInfo info={moreInfo} focusable={false}/>}
    </li>
  )
}

export default PaletteItemComponent;
