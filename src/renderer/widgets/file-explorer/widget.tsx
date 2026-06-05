/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import { Settings } from './settings';
import { CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileTree, useFileTree } from '@pierre/trees/react';
import { preparePresortedFileTreeInput } from '@pierre/trees';
import type { ContextMenuItem, ContextMenuOpenContext, FileTreeRowDecoration, FileTreeRowDecorationContext } from '@pierre/trees';
import { buildEntryPaths, buildRootEntries, humanFileSize, toMapKey, toTreePath } from './treeModel';
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

function WidgetComp({settings, widgetApi}: WidgetReactComponentProps<Settings>) {
  const { fs, shell, clipboard } = widgetApi;
  const { paths, showFileSize, showHiddenFiles } = settings;

  // Stable string key for the configured folders. The effects depend on this
  // (not the `paths` array) so they don't re-run when the store hands back a new
  // array reference with identical contents.
  const pathsKey = useMemo(() => paths.join('\n'), [paths]);
  const hasFolders = useMemo(() => pathsKey.split('\n').some(p => p.trim() !== ''), [pathsKey]);

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
    // Built-in search (Ctrl/Cmd+F). Note: only matches already-loaded nodes —
    // i.e. folders the user has expanded — because children load lazily.
    search: true,
    fileTreeSearchMode: 'hide-non-matches'
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

  // Rebuild the root from the configured favorite folders whenever they change.
  // Also re-runs when `showFileSize` / `showHiddenFiles` toggle so the tree
  // collapses to roots and reloads children with the new decoration / filter
  // (acceptable churn for rarely-toggled settings).
  useEffect(() => {
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
    model.resetPaths(undefined as unknown as readonly string[], { preparedInput: preparePresortedFileTreeInput(built.treePaths) });
  }, [pathsKey, showFileSize, showHiddenFiles, model, registerEntries]);

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
          built.treePaths.forEach(p => model.add(p));
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
    }
  }, [model, shell]);

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
    const openLabel = item.kind === 'directory' ? 'Open in File Explorer' : 'Open';
    return createPortal(
      <div className={styles['menu']} style={menuPos} data-file-tree-context-menu-root="true">
        <button onClick={() => { shell.openPath(abs); context.close(); }}>{openLabel}</button>
        <button onClick={() => { clipboard.writeText(abs); context.close(); }}>Copy Path</button>
      </div>,
      document.body
    );
  }, [shell, clipboard]);

  if (!hasFolders) {
    return <div className={styles['message']}>No folders configured. Add folders in the widget settings.</div>;
  }

  return (
    <div className={styles['root']} onDoubleClick={onDoubleClick}>
      <FileTree model={model} renderContextMenu={renderContextMenu} style={treeThemeStyle} />
    </div>
  );
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}

