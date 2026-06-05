/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppState } from '@/base/state/app';
import { EntitiesState } from '@/base/state/entities';
import { UiState } from '@/base/state/ui';

export interface SharedState {
  readonly apps: {
    apps: EntitiesState['apps'];
    appIds: UiState['apps']['appIds'];
  };
  readonly sharedDataKeys: {
    sharedDataKeys: EntitiesState['sharedDataKeys'];
  };
}

export type SharedStateSliceName = keyof SharedState;

type SharedStateSliceFactory<N extends SharedStateSliceName> = (appState: AppState) => SharedState[N];
type SharedStateSliceFactories = {
  [N in SharedStateSliceName]: SharedStateSliceFactory<N>;
};

const sharedStateSliceFactories: SharedStateSliceFactories = {
  apps: appState => ({
    appIds: appState.ui.apps.appIds,
    apps: appState.entities.apps
  }),
  sharedDataKeys: appState => ({
    sharedDataKeys: appState.entities.sharedDataKeys,
  }),
}

export function createSharedState(appState: AppState, availableSlices: SharedStateSliceName[]): SharedState {
  return Object.fromEntries(availableSlices.map(name => ([name, sharedStateSliceFactories[name](appState)]))) as unknown as SharedState
}

function shallowEqualSlice(a: object, b: object): boolean {
  if (a === b) {
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  for (const key of keysA) {
    if (recA[key] !== recB[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Equality for a SharedState produced by createSharedState. createSharedState builds a fresh
 * wrapper object (and fresh per-slice objects) on every call, so the default 1-level shallow
 * equality used by useAppState never matches non-empty shared state — every store change then
 * re-renders the widget even when its shared slices are untouched.
 *
 * This compares each slice's own fields by reference (a 2-level shallow). Every shared source
 * (entities.apps, entities.sharedDataKeys, ui.apps.appIds) is updated immutably — its reference
 * changes iff its content changes — so this re-renders exactly when the shared data changes and
 * never serves stale data, while skipping renders caused by unrelated state changes.
 */
export function sharedStateEquals(a: SharedState, b: SharedState): boolean {
  if (a === b) {
    return true;
  }
  const keysA = Object.keys(a) as SharedStateSliceName[];
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    const sliceA = a[key];
    const sliceB = b[key];
    if (sliceA === undefined || sliceB === undefined) {
      if (sliceA !== sliceB) {
        return false;
      }
      continue;
    }
    if (!shallowEqualSlice(sliceA, sliceB)) {
      return false;
    }
  }
  return true;
}
