/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { CSSProperties, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileTree, useFileTree } from '@pierre/trees/react';
import { preparePresortedFileTreeInput } from '@pierre/trees';
import type { ContextMenuItem, ContextMenuOpenContext, FileTreeRowDecoration, FileTreeRowDecorationContext } from '@pierre/trees';
import { basenameOf, buildEntryPaths, buildRootEntries, dirnameOf, hitLocation, humanFileSize, toMapKey, toTreePath } from './treeModel';
import { collapseAllSvg, refreshSvg, searchSvg } from './icons';
import { FsSearchHit, FsSearchResult } from '@common/base/fs';
import styles from './widget.module.scss';

// Bind the tree's theme custom properties to Freeter's theme vars so the tree
// follows the active Freeter theme (light / dark) automatically — no hardcoded
// colors, no theme picker. CSS custom properties inherit into the tree's shadow
// DOM through the host element.
const treeThemeStyle = {
  height: '100%',
  // Drop the tree's default 16px inline (left/right) gutter so rows sit closer
  // to the widget edge. Official override hook — no internal-DOM targeting.
  '--trees-padding-inline-override': '0px',
  backgroundColor: 'var(--freeter-widgetBackground)',
  color: 'var(--freeter-widgetColor)',
  borderColor: 'var(--freeter-componentBorder)',
  '--trees-theme-sidebar-bg': 'var(--freeter-widgetBackground)',
  '--trees-theme-sidebar-fg': 'var(--freeter-widgetColor)',
  '--trees-theme-sidebar-header-fg': 'var(--freeter-widgetColor)',
  '--trees-theme-list-active-selection-fg': 'var(--freeter-widgetColor)',
  '--trees-theme-list-active-selection-bg': 'var(--freeter-primary20)',
  '--trees-theme-list-hover-bg': 'var(--freeter-componentColor10)',
  '--trees-theme-focus-ring': 'var(--freeter-primary)',
  '--trees-theme-input-bg': 'var(--freeter-inputBackground)',
} as CSSProperties;

// Search after typing pauses: each search walks the folders on disk.
const searchDelayMs = 250;

// The answer for one search: the query and the settings it ran with, so an answer for older input is not shown.
type SearchAnswer = { key: string } & ({ status: 'done'; result: FsSearchResult } | { status: 'failed' });
const noHits: FsSearchHit[] = [];

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { fs, shell, clipboard, updateActionBar } = widgetApi;
  const { paths, showFileSize, showHiddenFiles } = settings;

  // Stable string key for the configured folders. The effects depend on this
  // (not the `paths` array) so they don't re-run when the store hands back a new
  // array reference with identical contents.
  const pathsKey = useMemo(() => paths.join('\n'), [paths]);
  const hasFolders = useMemo(() => pathsKey.split('\n').some(p => p.trim() !== ''), [pathsKey]);
  // The favorite roots in tree order; search hits name the root they are under by index.
  const roots = useMemo(() => buildRootEntries(pathsKey.split('\n')).entries, [pathsKey]);

  // key (relative, no trailing slash) -> absolute OS path, used to open entries.
  const absByKey = useRef<Map<string, string>>(new Map());
  // dir key -> its tree path (with trailing slash); the set of dirs to watch for expansion.
  const dirTreePaths = useRef<Map<string, string>>(new Map());
  // file key -> size in bytes, shown as a right-aligned row decoration.
  const sizeByKey = useRef<Map<string, number>>(new Map());
  const loadedDirs = useRef<Set<string>>(new Set());
  // Bumped on every root rebuild; in-flight lazy loads from a previous tree check
  // this to avoid adding stale children after the favorites change.
  const loadEpoch = useRef(0);
  // Current "show file size" setting, read inside the (stable) decoration callback.
  const showFileSizeRef = useRef(showFileSize);
  // Both settings are also read (via refs) inside the stable lazy-load effect to
  // build the readDir options without re-subscribing on every settings change.
  const showHiddenFilesRef = useRef(showHiddenFiles);

  // Show the file size at the right end of each file row (directories: nothing).
  const renderRowDecoration = useCallback((ctx: FileTreeRowDecorationContext): FileTreeRowDecoration | null => {
    if (!showFileSizeRef.current || ctx.item.kind === 'directory') {
      return null;
    }
    const size = sizeByKey.current.get(toMapKey(ctx.item.path));
    if (size === undefined) {
      return null;
    }
    return { text: humanFileSize(size), title: `${size.toLocaleString()} bytes` };
  }, []);

  const { model } = useFileTree({
    paths: [],
    initialExpansion: 'closed',
    density: 'compact',
    icons: { set: 'standard', colored: true },
    renderRowDecoration,
    // The library's search only matches loaded (expanded) folders, and its input breaks Korean (IME) typing. The widget
    // has its own search box instead, which searches every subfolder on disk.
    search: false
  });

  const registerEntries = useCallback((entries: ReturnType<typeof buildEntryPaths>['entries']) => {
    for (const e of entries) {
      absByKey.current.set(e.key, e.path);
      if (e.isDirectory) {
        dirTreePaths.current.set(e.key, toTreePath(e.key, true));
      } else {
        sizeByKey.current.set(e.key, e.size);
      }
    }
  }, []);

  // Collapse the tree back to its favorite roots and drop all cached children,
  // so the next expansion re-reads from disk. Reused by both the settings-change
  // effect and the Refresh action.
  const rebuildRoots = useCallback(() => {
    showFileSizeRef.current = showFileSize;
    showHiddenFilesRef.current = showHiddenFiles;
    loadEpoch.current += 1;
    absByKey.current.clear();
    dirTreePaths.current.clear();
    sizeByKey.current.clear();
    loadedDirs.current.clear();
    const built = buildRootEntries(pathsKey.split('\n'));
    registerEntries(built.entries);
    // Feed the roots as a *presorted* prepared input (and omit `paths`) so the
    // tree keeps the user's configured folder order verbatim instead of applying
    // its default folder sort. Children loaded lazily below still use the tree's
    // default (natural, folders-first) sibling sort, which respects `sort: 'default'`.
    // Use the options-only overload: since @pierre/trees 1.0.0-beta.6 a non-array
    // first argument is read as the options object, so `resetPaths(undefined, {...})` throws.
    model.resetPaths({ preparedInput: preparePresortedFileTreeInput(built.treePaths) });
  }, [pathsKey, showFileSize, showHiddenFiles, model, registerEntries]);

  // Rebuild the root from the configured favorite folders whenever they change.
  // Also re-runs when `showFileSize` / `showHiddenFiles` toggle so the tree
  // collapses to roots and reloads children with the new decoration / filter
  // (acceptable churn for rarely-toggled settings).
  useEffect(() => {
    rebuildRoots();
  }, [rebuildRoots]);

  // Lazily read a directory's children the first time it gets expanded.
  useEffect(() => {
    const loadExpanded = () => {
      dirTreePaths.current.forEach((treePath, key) => {
        if (loadedDirs.current.has(key)) {
          return;
        }
        const item = model.getItem(treePath);
        // Only directory handles expose isExpanded(); the `in` check narrows the union.
        if (!item || !('isExpanded' in item) || !item.isExpanded()) {
          return;
        }
        loadedDirs.current.add(key);
        const abs = absByKey.current.get(key);
        if (!abs) {
          return;
        }
        const epoch = loadEpoch.current;
        fs.readDir(abs, { includeHidden: showHiddenFilesRef.current, includeSizes: showFileSizeRef.current }).then(entries => {
          // Drop the result if the favorites were rebuilt while this was loading.
          if (epoch !== loadEpoch.current) {
            return;
          }
          const built = buildEntryPaths(key, entries);
          registerEntries(built.entries);
          // One batch: each separate add() would rebuild the visible tree and
          // re-run this listener, which is O(n²) for a large folder.
          model.batch(built.treePaths.map(path => ({ type: 'add' as const, path })));
        }).catch(() => {
          // A transient failure (locked folder, permission blip, folder removed
          // mid-read) shouldn't permanently mark the dir as loaded — drop it so a
          // later expansion retries instead of showing a silently-empty folder.
          // (If the favorites were rebuilt meanwhile, loadedDirs was cleared and
          // this delete is a harmless no-op.)
          loadedDirs.current.delete(key);
        });
      });
    };
    return model.subscribe(loadExpanded);
  }, [model, fs, registerEntries]);

  // Double-click opens FILES only — directories are reserved for expand/collapse
  // (a click already toggles them), so opening a folder goes via the context menu.
  const onDoubleClick = useCallback(() => {
    const path = model.getFocusedPath();
    if (!path) {
      return;
    }
    const mapKey = toMapKey(path);
    if (dirTreePaths.current.has(mapKey)) {
      return;
    }
    const abs = absByKey.current.get(mapKey);
    if (abs) {
      shell.openPath(abs);
      widgetApi.logActivity('file_open', { text: basenameOf(abs), detail: abs });
    }
  }, [model, shell, widgetApi]);

  const renderContextMenu = useCallback((item: ContextMenuItem, context: ContextMenuOpenContext) => {
    const abs = absByKey.current.get(toMapKey(item.path));
    if (!abs) {
      return null;
    }
    // Portal to <body>: the widget tile uses a CSS `transform`, which would make
    // a `position: fixed` menu anchor to the tile instead of the viewport. The
    // body has no transform, so fixed coords match the click point (anchorRect is
    // viewport-based, from event.clientX/Y). The data attribute tells the library
    // not to treat clicks inside the menu as an outside-click (which closes it).
    const { anchorRect } = context;
    const menuPos: CSSProperties = { left: anchorRect.x, top: anchorRect.y };
    const isDir = item.kind === 'directory';
    const openLabel = isDir ? 'Open in File Explorer' : 'Open';
    return createPortal(
      <div className={styles['menu']} style={menuPos} data-file-tree-context-menu-root="true">
        <button onClick={() => { shell.openPath(abs); if (!isDir) { widgetApi.logActivity('file_open', { text: basenameOf(abs), detail: abs }); } context.close(); }}>{openLabel}</button>
        {!isDir && <button onClick={() => { shell.openPath(dirnameOf(abs)); context.close(); }}>Open Containing Folder</button>}
        <button onClick={() => { clipboard.writeText(abs); context.close(); }}>Copy Path</button>
        <button onClick={() => { clipboard.writeText(basenameOf(abs)); context.close(); }}>Copy Name</button>
      </div>,
      document.body
    );
  }, [shell, clipboard, widgetApi]);

  // Collapse every known (loaded) directory back to its roots. Collapsing each
  // dir — not just the roots — means re-expanding a root shows its children
  // collapsed too. Children stay loaded, so re-expanding is instant (no re-read).
  const collapseAll = useCallback(() => {
    dirTreePaths.current.forEach(treePath => {
      const item = model.getItem(treePath);
      if (item && 'collapse' in item) {
        item.collapse();
      }
    });
  }, [model]);

  // Search: a plain <input>, so IME composition (Korean) works as in any text field; the folders are searched in main.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [selected, setSelected] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The last search sent to main; the next one waits for it (one walk at a time).
  const searchRunRef = useRef<Promise<void>>(Promise.resolve());
  const listId = useId();
  const trimmedQuery = query.trim();

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // Already open: just focus it. Opening: the effect below focuses it after render.
    searchInputRef.current?.focus();
  }, []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery('');
    // The input goes away; keep focus in the widget so Ctrl+F opens the search again.
    rootRef.current?.focus();
  }, []);
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const searchKey = `${trimmedQuery}\n${pathsKey}\n${showHiddenFiles}`;
  useEffect(() => {
    if (!searchOpen || trimmedQuery === '') {
      return undefined;
    }
    // `stale`: the input changed since. Its search is skipped if it has not started, and its answer is dropped.
    let stale = false;
    const timer = setTimeout(() => {
      // A walk in main cannot be stopped, so searches go one at a time: typing with pauses does not start several walks.
      searchRunRef.current = searchRunRef.current.then(async () => {
        if (stale) {
          return;
        }
        try {
          const result = await fs.search(roots.map(r => r.path), trimmedQuery, { includeHidden: showHiddenFiles });
          if (!stale) {
            setAnswer({ key: searchKey, status: 'done', result });
            setSelected(0);
          }
        } catch {
          if (!stale) {
            setAnswer({ key: searchKey, status: 'failed' });
          }
        }
      });
    }, searchDelayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searchOpen, trimmedQuery, searchKey, roots, showHiddenFiles, fs]);

  // No answer for the current input yet: searching. The last list stays until the new one comes, so it does not flicker.
  const searching = answer?.key !== searchKey;
  const hits = answer?.status === 'done' ? answer.result.hits : noHits;
  let searchStatus = '';
  if (searching) {
    searchStatus = 'Searching…';
  } else if (answer?.status === 'failed') {
    searchStatus = 'Search failed.';
  } else if (answer?.result.limit === 'scanned') {
    searchStatus = 'Stopped early: the folders hold too many items to search them all. Register smaller folders to search everything.';
  } else if (answer?.result.limit === 'results') {
    searchStatus = `Showing the first ${hits.length} matches. Type more to narrow the search.`;
  } else if (hits.length === 0) {
    searchStatus = 'No matches.';
  }

  // Files open in their default app; folders open in the OS file manager (the tree's double-click on a folder only
  // expands it, but a search hit has no tree row to expand).
  const openHit = useCallback((hit: FsSearchHit) => {
    shell.openPath(hit.path);
    if (!hit.isDirectory) {
      widgetApi.logActivity('file_open', { text: hit.name, detail: hit.path });
    }
  }, [shell, widgetApi]);

  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) {
      return; // Enter or arrows that finish a Korean syllable must not also open or move.
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (hits.length > 0) {
        setSelected(i => (e.key === 'ArrowDown' ? Math.min(i + 1, hits.length - 1) : Math.max(i - 1, 0)));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (hits[selected]) {
        openHit(hits[selected]);
      }
    }
  }, [closeSearch, hits, selected, openHit]);

  const onRootKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
    }
  }, [openSearch]);

  const showResults = searchOpen && trimmedQuery !== '';
  const optionId = useCallback((i: number) => `${listId}-${i}`, [listId]);

  // Keep the selected row in view when the selection or the list changes (not on every render: that would undo the
  // user's own scrolling).
  useEffect(() => {
    if (showResults) {
      document.getElementById(optionId(selected))?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [showResults, selected, hits, optionId]);

  useEffect(() => {
    updateActionBar(!hasFolders ? [] : [
      {
        enabled: true,
        icon: searchSvg,
        id: 'SEARCH',
        title: 'Search in Folders (Ctrl+F)',
        doAction: async () => openSearch()
      },
      {
        enabled: true,
        icon: refreshSvg,
        id: 'REFRESH',
        title: 'Refresh',
        doAction: async () => rebuildRoots()
      },
      {
        enabled: true,
        icon: collapseAllSvg,
        id: 'COLLAPSE-ALL',
        title: 'Collapse All',
        doAction: async () => collapseAll()
      }
    ]);
  }, [updateActionBar, hasFolders, collapseAll, rebuildRoots, openSearch]);

  if (!hasFolders) {
    return <div className={styles['message']}>No folders configured. Add folders in the widget settings.</div>;
  }

  return (
    <div className={styles['root']} ref={rootRef} tabIndex={-1} onKeyDown={onRootKeyDown}>
      {searchOpen && (
        <div className={styles['search']}>
          <input
            ref={searchInputRef}
            type="search"
            className={styles['search-input']}
            placeholder="Search in folders"
            aria-label="Search in folders"
            role="combobox"
            aria-expanded={showResults}
            aria-controls={listId}
            aria-activedescendant={hits[selected] ? optionId(selected) : undefined}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            maxLength={200}
          />
        </div>
      )}
      {showResults && (
        <>
          <ul id={listId} className={styles['results']} role="listbox" aria-label="Search results">
            {hits.map((hit, i) => (
              <li
                key={hit.path}
                id={optionId(i)}
                role="option"
                aria-selected={i === selected}
                className={i === selected ? `${styles['hit']} ${styles['hit-selected']}` : styles['hit']}
                title={hit.path}
                // Keep focus in the search box, where the arrow keys, Enter and Esc are handled.
                onMouseDown={e => e.preventDefault()}
                onClick={() => setSelected(i)}
                onDoubleClick={() => openHit(hit)}
              >
                <span className={styles['hit-name']}>{hit.isDirectory ? `${hit.name}/` : hit.name}</span>
                <span className={styles['hit-location']}>{hitLocation(hit, roots)}</span>
              </li>
            ))}
          </ul>
          <div className={styles['search-status']} role="status">{searchStatus}</div>
        </>
      )}
      <div className={styles['tree']} hidden={showResults} onDoubleClick={onDoubleClick}>
        <FileTree model={model} renderContextMenu={renderContextMenu} style={treeThemeStyle} />
      </div>
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}

