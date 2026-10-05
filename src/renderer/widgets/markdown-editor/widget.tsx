/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FileTree, useFileTree } from '@pierre/trees/react';
import type { FileTreeBatchOperation } from '@pierre/trees';
import '@mdxeditor/editor/style.css';
import { TreeEntry, basenameOf, buildChildEntries, isSameOrDescendantKey, toMapKey, toTreePath } from './treeModel';
import { TabsState, closeTab, emptyTabsState, openTab, parseTabsState } from './tabs';
import { DocEditor, DocErrorBoundary } from './docEditor';
import styles from './widget.module.scss';

/** How often the tree re-reads its expanded folders to show added and deleted files. */
export const treeRefreshIntervalMs = 2000;
/** Widget data storage key of the open tabs. */
export const tabsStorageKey = 'tabs';
/** Widget data storage key of the tree width in px. */
export const treeWidthStorageKey = 'treeWidth';
/** Narrowest tree the splitter allows, in px. */
const minTreeWidth = 80;
/** Tree width change per arrow key press on the focused splitter, in px. */
const splitterKeyStep = 16;

// Same theme binding as the File Explorer tree: the tree's custom properties
// follow Freeter's theme vars, which inherit into its shadow DOM.
const treeThemeStyle = {
  height: '100%',
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

/** The tree path of the file row a click landed on, or null (folder row, empty space). */
function clickedFileTreePath(e: MouseEvent): string | null {
  // Rows live in the tree's shadow DOM; composedPath() still lists them.
  for (const target of e.nativeEvent.composedPath()) {
    if (target instanceof HTMLElement && target.dataset.itemType) {
      return target.dataset.itemType === 'file' ? target.dataset.itemPath ?? null : null;
    }
  }
  return null;
}

function WidgetComp({settings, widgetApi, env}: WidgetReactComponentProps<Settings>) {
  const { fs, dataStorage } = widgetApi;
  const folder = settings.folder.trim();
  // The settings dialog shows a live preview with the same widget id and storage.
  // The preview starts with no tabs (restoring them would mount every editor a
  // second time) and stores nothing, so it never changes the widget's own state.
  const isPreview = !!env.isPreview;
  const storeJson = useCallback((key: string, value: unknown) => {
    if (!isPreview) {
      dataStorage.setJson(key, value);
    }
  }, [dataStorage, isPreview]);

  const [tabs, setTabs] = useState<TabsState>(emptyTabsState);
  // The stored tabs are written back only after they were read, so the empty
  // first render never overwrites them.
  const tabsLoaded = useRef(false);

  useEffect(() => {
    if (isPreview) {
      return;
    }
    dataStorage.getJson(tabsStorageKey).then(value => {
      // A tab the user opened while this read was pending wins over the stored ones.
      setTabs(cur => cur.paths.length > 0 ? cur : parseTabsState(value));
      tabsLoaded.current = true;
    });
  }, [dataStorage, isPreview]);

  useEffect(() => {
    if (tabsLoaded.current) {
      storeJson(tabsStorageKey, tabs);
    }
  }, [storeJson, tabs]);

  // Tree state, keyed by paths relative to the folder ('' is the folder itself).
  // key -> absolute OS path, for every row in the tree.
  const absByKey = useRef(new Map<string, string>());
  // key -> isDirectory, for every row in the tree.
  const isDirByKey = useRef(new Map<string, boolean>());
  // Loaded directory key -> its child keys as last read from disk.
  const childrenByDir = useRef(new Map<string, Set<string>>());
  // Bumped on every rebuild; reads started before it drop their result.
  const loadEpoch = useRef(0);
  const refreshing = useRef(false);
  // The configured folder whose last read failed (wrong path, no access,
  // removed). Keyed by folder, so a new folder starts without the notice.
  const [unreadableFolder, setUnreadableFolder] = useState<string | null>(null);
  const folderUnreadable = unreadableFolder === folder;

  const { model } = useFileTree({
    paths: [],
    initialExpansion: 'closed',
    density: 'compact',
    icons: { set: 'standard', colored: true },
    // Built-in search (Ctrl/Cmd+F) covers loaded (expanded) folders only.
    search: true,
    fileTreeSearchMode: 'hide-non-matches'
  });

  /** Drop `key` and everything below it from the tree state. */
  const forgetKey = useCallback((key: string) => {
    for (const map of [absByKey.current, isDirByKey.current, childrenByDir.current]) {
      for (const k of [...map.keys()]) {
        if (isSameOrDescendantKey(k, key)) {
          map.delete(k);
        }
      }
    }
  }, []);

  /**
   * Record a directory's fresh listing and return the tree operations that
   * turn its previous listing into this one.
   */
  const applyListing = useCallback((dirKey: string, entries: TreeEntry[]): FileTreeBatchOperation[] => {
    const prev = childrenByDir.current.get(dirKey) ?? new Set<string>();
    const next = new Set(entries.map(e => e.key));
    const ops: FileTreeBatchOperation[] = [];
    for (const key of prev) {
      if (!next.has(key)) {
        const isDir = isDirByKey.current.get(key) ?? false;
        ops.push(isDir ? { type: 'remove', path: toTreePath(key, true), recursive: true } : { type: 'remove', path: key });
        forgetKey(key);
      }
    }
    for (const entry of entries) {
      if (!prev.has(entry.key)) {
        absByKey.current.set(entry.key, entry.path);
        isDirByKey.current.set(entry.key, entry.isDirectory);
        ops.push({ type: 'add', path: toTreePath(entry.key, entry.isDirectory) });
      }
    }
    childrenByDir.current.set(dirKey, next);
    return ops;
  }, [forgetKey]);

  const readListing = useCallback(async (dirKey: string): Promise<TreeEntry[]> => {
    const abs = dirKey === '' ? folder : absByKey.current.get(dirKey);
    if (!abs) {
      return [];
    }
    return buildChildEntries(dirKey, await fs.readDir(abs, { includeHidden: false, includeSizes: false }));
  }, [fs, folder]);

  // Load the folder's top level whenever the folder changes.
  useEffect(() => {
    loadEpoch.current += 1;
    const epoch = loadEpoch.current;
    absByKey.current.clear();
    isDirByKey.current.clear();
    childrenByDir.current.clear();
    model.resetPaths([]);
    if (folder === '') {
      return;
    }
    readListing('').then(entries => {
      if (epoch === loadEpoch.current) {
        model.batch(applyListing('', entries));
        // A notice left from an earlier failed read of this same folder goes away.
        setUnreadableFolder(null);
      }
    }, () => epoch === loadEpoch.current && setUnreadableFolder(folder));
  }, [folder, model, readListing, applyListing]);

  // Read a directory's children the first time it is expanded.
  useEffect(() => {
    const pending = new Set<string>();
    const loadExpanded = () => {
      isDirByKey.current.forEach((isDir, key) => {
        if (!isDir || childrenByDir.current.has(key) || pending.has(key)) {
          return;
        }
        const item = model.getItem(toTreePath(key, true));
        if (!item || !('isExpanded' in item) || !item.isExpanded()) {
          return;
        }
        pending.add(key);
        const epoch = loadEpoch.current;
        readListing(key).then(entries => {
          // Skip when the folder was rebuilt or this directory vanished meanwhile.
          if (epoch === loadEpoch.current && isDirByKey.current.has(key)) {
            model.batch(applyListing(key, entries));
          }
        }).catch(() => undefined).finally(() => pending.delete(key));
      });
    };
    return model.subscribe(loadExpanded);
  }, [model, readListing, applyListing]);

  // ponytail: re-reads the folder and every expanded folder every 2 s (one
  // readDir IPC each). A main-side recursive fs.watch would scale better with
  // many expanded folders.
  useEffect(() => {
    if (folder === '') {
      return undefined;
    }
    const refresh = async () => {
      if (refreshing.current) {
        return;
      }
      refreshing.current = true;
      const epoch = loadEpoch.current;
      try {
        // The folder itself is always re-read, even when its first read failed,
        // so a folder that appears later (or a fixed path) loads by itself.
        const dirKeys = ['', ...[...childrenByDir.current.keys()].filter(key => {
          if (key === '') {
            return false;
          }
          const item = model.getItem(toTreePath(key, true));
          return !!item && 'isExpanded' in item && item.isExpanded();
        })];
        const listings = await Promise.all(dirKeys.map(key => readListing(key).then(entries => ({ key, entries }), () => null)));
        if (epoch !== loadEpoch.current) {
          return;
        }
        setUnreadableFolder(listings[0] === null ? folder : null);
        const ops: FileTreeBatchOperation[] = [];
        for (const listing of listings) {
          // A directory removed by an earlier listing in this pass is skipped.
          if (listing && (listing.key === '' || childrenByDir.current.has(listing.key))) {
            ops.push(...applyListing(listing.key, listing.entries));
          }
        }
        if (ops.length > 0) {
          model.batch(ops);
        }
      } finally {
        refreshing.current = false;
      }
    };
    const timer = setInterval(refresh, treeRefreshIntervalMs);
    return () => clearInterval(timer);
  }, [folder, model, readListing, applyListing]);

  const onTreeClick = useCallback((e: MouseEvent) => {
    const treePath = clickedFileTreePath(e);
    const abs = treePath === null ? undefined : absByKey.current.get(toMapKey(treePath));
    if (abs) {
      setTabs(cur => openTab(cur, abs));
    }
  }, []);

  // Tree width in px set by the splitter; null keeps the CSS default (30%).
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const treePaneRef = useRef<HTMLDivElement>(null);

  // Restore the stored width. A width set before this read resolves wins.
  useEffect(() => {
    dataStorage.getJson(treeWidthStorageKey).then(value => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        setTreeWidth(cur => cur ?? Math.max(minTreeWidth, value));
      }
    });
  }, [dataStorage]);

  // Drag the splitter to resize the tree. Pointer capture keeps the drag alive
  // when the pointer leaves the thin handle.
  const onSplitterPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const pane = treePaneRef.current;
    if (!pane || e.button !== 0) {
      return;
    }
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = pane.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    let width = startWidth;
    const onMove = (ev: globalThis.PointerEvent) => {
      width = Math.max(minTreeWidth, startWidth + ev.clientX - startX);
      setTreeWidth(width);
    };
    // Store once per drag, not on every move.
    const onEnd = () => {
      if (width !== startWidth) {
        storeJson(treeWidthStorageKey, width);
      }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }, [storeJson]);

  // Keyboard resizing for the focused splitter.
  const onSplitterKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const pane = treePaneRef.current;
    const step = e.key === 'ArrowLeft' ? -splitterKeyStep : e.key === 'ArrowRight' ? splitterKeyStep : 0;
    if (pane && step !== 0) {
      e.preventDefault();
      const width = Math.max(minTreeWidth, pane.getBoundingClientRect().width + step);
      setTreeWidth(width);
      storeJson(treeWidthStorageKey, width);
    }
  }, [storeJson]);

  if (folder === '') {
    return <div className={styles['message']}>No folder configured. Choose a folder in the widget settings.</div>;
  }

  return (
    <div className={styles['root']}>
      <div ref={treePaneRef} className={styles['tree-pane']} style={treeWidth === null ? undefined : { width: treeWidth }} onClick={onTreeClick}>
        {folderUnreadable && (
          <div className={styles['notice']} title={folder}>Cannot read the folder. Check the path in the widget settings. Retrying every 2 seconds.</div>
        )}
        <FileTree model={model} style={treeThemeStyle} />
      </div>
      <div
        className={styles['splitter']}
        role='separator'
        aria-orientation='vertical'
        aria-label='Resize the file tree'
        tabIndex={0}
        onPointerDown={onSplitterPointerDown}
        onKeyDown={onSplitterKeyDown}
      />
      <div className={styles['editor-pane']}>
        {tabs.paths.length > 0 && (
          <div className={styles['tab-bar']} role='tablist'>
            {tabs.paths.map(path => (
              <div
                key={path}
                role='tab'
                tabIndex={0}
                aria-selected={path === tabs.active}
                className={styles['tab'] + (path === tabs.active ? ' ' + styles['active'] : '')}
                title={path}
                onClick={() => setTabs(cur => openTab(cur, path))}
                onKeyDown={e => {
                  // Keyboard users activate a tab like a button.
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setTabs(cur => openTab(cur, path));
                  }
                }}
                onAuxClick={e => e.button === 1 && setTabs(cur => closeTab(cur, path))}
              >
                <span className={styles['tab-name']}>{basenameOf(path)}</span>
                <button
                  className={styles['tab-close']}
                  title='Close'
                  aria-label={`Close ${basenameOf(path)}`}
                  onClick={e => {
                    e.stopPropagation();
                    setTabs(cur => closeTab(cur, path));
                  }}
                >×</button>
              </div>
            ))}
          </div>
        )}
        {/* ponytail: every open tab keeps its editor mounted (hidden when
            inactive) so its undo history survives tab switches. Memory grows
            with the tab count; there is no cap. */}
        {tabs.paths.map(path => (
          <div key={path} className={styles['doc']} hidden={path !== tabs.active}>
            <DocErrorBoundary path={path} fs={fs}>
              <DocEditor path={path} active={path === tabs.active} fs={fs} />
            </DocErrorBoundary>
          </div>
        ))}
        {tabs.paths.length === 0 && <div className={styles['message']}>Select a Markdown file in the tree.</div>}
      </div>
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
