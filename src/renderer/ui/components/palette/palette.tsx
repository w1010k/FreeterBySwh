/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PaletteViewModelHook } from './paletteViewModel';
import clsx from 'clsx';
import styles from './palette.module.scss';
import PaletteItem from './paletteItem';
import { memo, useState } from 'react';

type Deps = {
  usePaletteViewModel: PaletteViewModelHook
}

export enum PalettePropsPos {
  TopBar = 1,
  TabBar = 2
}

export interface PaletteProps extends React.PropsWithChildren<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>> {
  pos: PalettePropsPos
};

export function createPaletteComponent({
  usePaletteViewModel
}: Deps) {
  function Palette({
    pos
  }: PaletteProps) {
    const {
      onAddItemDragEnd,
      onAddItemDragStart,
      onAddItemClick,
      onPasteItemDragEnd,
      onPasteItemDragStart,
      onPasteItemClick,
      onAddContextMenu,
      onPasteContextMenu,
      widgetTypes,
      copiedWidgets,
      hideSections
    } = usePaletteViewModel();

    // Client-side filter over the widget-type list. Kept as local component
    // state — it's purely presentational.
    const [search, setSearch] = useState('');
    const query = search.trim().toLowerCase();
    const visibleWidgetTypes = query === ''
      ? widgetTypes
      : widgetTypes.filter(item => item.name.toLowerCase().includes(query));

    return (
      <div
        className={clsx(
          styles.palette,
          hideSections && styles['hide-sections'],
          pos === PalettePropsPos.TabBar && styles['pos-tab-bar'],
          pos === PalettePropsPos.TopBar && styles['pos-top-bar'],
        )}
      >
        {/* The sections are CSS hover/focus dropdowns; the spans are their
            triggers (focus also opens them — see the :focus rules in scss). */}
        <span className={clsx(styles['palette-tab'], styles['palette-tab-add'])} tabIndex={0} role="button" aria-haspopup="true">Add Widget</span>
        <span className={clsx(styles['palette-tab'], styles['palette-tab-paste'])} tabIndex={0} role="button" aria-haspopup="true">Paste Widget</span>
        <div
          data-testid="palette-add"
          className={clsx(styles['palette-section'], styles['palette-section-add'])}
        >
          <input
            type="text"
            className={styles['palette-search']}
            placeholder="Search widgets"
            aria-label="Search widgets"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ul className={styles['palette-list']}>
          {visibleWidgetTypes.map(item => (
            <PaletteItem
              key={item.id}
              id={item.id}
              icon={item.icon}
              name={item.name}
              moreInfo={item.description}
              onDragStart={onAddItemDragStart}
              onDragEnd={onAddItemDragEnd}
              onClick={onAddItemClick}
              onContextMenu={onAddContextMenu}
            />
          ))}
          </ul>
          {visibleWidgetTypes.length === 0 && <div className={styles['palette-sectionnote']}>No widgets found</div>}
        </div>
        {
          copiedWidgets.length>0
            ? <ul
                data-testid="palette-paste"
                className={clsx(styles['palette-section'], styles['palette-section-paste'])}
              >
              {copiedWidgets.map(item => (
                <PaletteItem
                  key={item.id}
                  id={item.id}
                  icon={item.icon}
                  name={item.name}
                  onDragStart={onPasteItemDragStart}
                  onDragEnd={onPasteItemDragEnd}
                  onClick={onPasteItemClick}
                  onContextMenu={onPasteContextMenu}
                  />
              ))}
              </ul>
            : <div className={clsx(styles['palette-section'], styles['palette-section-paste'], styles['palette-sectionnote'])}>
                No widgets to paste
              </div>
        }
      </div>
    )
  }

  return memo(Palette)
}
