/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** Open editor tabs, identified by absolute file path, in display order. */
export interface TabsState {
  paths: string[];
  /** Path of the visible tab, or `null` when no tab is open. */
  active: string | null;
}

export const emptyTabsState: TabsState = { paths: [], active: null };

/** Activate `path`, appending a new tab when it is not open yet. */
export function openTab(state: TabsState, path: string): TabsState {
  return {
    paths: state.paths.includes(path) ? state.paths : [...state.paths, path],
    active: path
  };
}

/**
 * Close the tab of `path`. Closing the active tab activates its right
 * neighbor, or the left one when it was the last tab.
 */
export function closeTab(state: TabsState, path: string): TabsState {
  const idx = state.paths.indexOf(path);
  if (idx < 0) {
    return state;
  }
  const paths = state.paths.filter(p => p !== path);
  if (state.active !== path) {
    return { paths, active: state.active };
  }
  return { paths, active: paths[Math.min(idx, paths.length - 1)] ?? null };
}

/**
 * Validate tabs read back from widget storage. Anything malformed falls back
 * to no tabs, so a damaged value never breaks the widget.
 */
export function parseTabsState(value: unknown): TabsState {
  if (typeof value !== 'object' || value === null) {
    return emptyTabsState;
  }
  const { paths, active } = value as Partial<TabsState>;
  if (!Array.isArray(paths)) {
    return emptyTabsState;
  }
  const validPaths = [...new Set(paths.filter((p): p is string => typeof p === 'string' && p !== ''))];
  return {
    paths: validPaths,
    active: typeof active === 'string' && validPaths.includes(active) ? active : (validPaths[0] ?? null)
  };
}
