/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import clsx from 'clsx';
import {memo, useState} from 'react';
import styles from './palette.module.scss';
import PaletteItem from './paletteItem';
import {PaletteViewModelHook} from './paletteViewModel';

type Deps = {
  usePaletteViewModel: PaletteViewModelHook
}

export enum PalettePropsPos {
  TopBar = 1,
  TabBar = 2
}

export interface PaletteProps extends React.PropsWithChildren<React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>> {
  pos: PalettePropsPos;
  /** Open the dropdown sections upward, for when there's no room below: a bottom bar, or the foot of a side bar. */
  dropUp?: boolean;
}

export function createPaletteComponent({
                                         usePaletteViewModel
                                       }: Deps) {
  function Palette({
                     pos,
                     dropUp
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

    const closeOnEscape = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.nativeEvent.isComposing && !e.repeat && e.target instanceof HTMLElement) {
        e.preventDefault();
        e.target.blur();
      }
    };
    // Enter or Space on a trigger goes into its (already open) section.
    const enterSection = (e: React.KeyboardEvent<HTMLElement>) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        e.currentTarget.nextElementSibling?.querySelector<HTMLElement>('input, [tabindex="0"]')?.focus();
      }
    };

    return (
      <div
        onKeyDown={closeOnEscape}
        className={clsx(
          styles.palette,
          hideSections && styles['hide-sections'],
          pos === PalettePropsPos.TabBar && styles['pos-tab-bar'],
          pos === PalettePropsPos.TopBar && styles['pos-top-bar'],
          dropUp && styles['drop-up'],
        )}
      >
        {/* The sections are CSS hover/focus dropdowns; the spans are their
            triggers (focus also opens them: see the :focus rules in scss).
            Each trigger comes right before its section, so Tab goes from it
            into the open section (search, items) before the next trigger.
            Escape closes an open one by taking the focus out of it. */}
        <span className={clsx(styles['palette-tab'], styles['palette-tab-add'])} tabIndex={0} role="button" onKeyDown={enterSection}
              aria-haspopup="true">Add Widget</span>
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
        <span className={clsx(styles['palette-tab'], styles['palette-tab-paste'])} tabIndex={0} role="button" onKeyDown={enterSection}
              aria-haspopup="true">Paste Widget</span>
        {
          copiedWidgets.length > 0
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
            : <div
              className={clsx(styles['palette-section'], styles['palette-section-paste'], styles['palette-sectionnote'])}>
              No widgets to paste
            </div>
        }
      </div>
    )
  }

  return memo(Palette)
}
