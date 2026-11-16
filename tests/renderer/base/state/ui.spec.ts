/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createUiState, EditTogglePos, isTopBarMerged } from '@/base/state/ui';
import { currentAppStateVersion, mergeAppStateWithPersistentAppState, migrateAppState, PersistentAppState } from '@/base/state/app';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';

describe('createUiState()', () => {
  it('starts a new install with one bar at the top: the Top Bar merged in, its widgets on the left', () => {
    const ui = createUiState();
    expect(ui.topBar).toBe(true);
    expect(ui.appConfig.workflowBarPos).toBe('top');
    expect(ui.appConfig.mergeTopBar).toBe(true);
    expect(ui.appConfig.mergedTopBarSide).toBe('left');
    expect(isTopBarMerged(ui)).toBe(true);
  });

  it('keeps the Edit Mode toggle at the right end of the tab bar', () => {
    expect(createUiState().editTogglePos).toBe(EditTogglePos.TabBarRight);
  });

  it('lets saved settings win over the new defaults', () => {
    const defaults = fixtureAppState({ ui: createUiState() });
    const saved = {
      ui: {
        topBar: false,
        appConfig: { ...defaults.ui.appConfig, workflowBarPos: 'left', mergeTopBar: false, mergedTopBarSide: 'right' }
      }
    } as unknown as PersistentAppState;
    const merged = mergeAppStateWithPersistentAppState(defaults, saved);
    expect(merged.ui.topBar).toBe(false);
    expect(merged.ui.appConfig.workflowBarPos).toBe('left');
    expect(merged.ui.appConfig.mergeTopBar).toBe(false);
    expect(merged.ui.appConfig.mergedTopBarSide).toBe('right');
  });
});

describe('migrateAppState() to version 3 (the new layout defaults)', () => {
  // What an update loads: the saved data, migrated, then merged over the new defaults.
  const load = (savedUi: object, ver = 2) => {
    const saved = { entities: {}, ui: savedUi } as unknown as PersistentAppState;
    return mergeAppStateWithPersistentAppState(fixtureAppState({ ui: createUiState() }), migrateAppState(saved, ver)).ui;
  };
  const savedAppConfig = () => {
    const { mergeTopBar: _m, mergedTopBarSide: _s, ...rest } = createUiState().appConfig;
    return rest;
  };

  it('is the current version', () => {
    expect(currentAppStateVersion).toBe(3);
  });

  it('keeps the side of a merge turned on in 2.8.0-swh.32 to .34 (saved without mergedTopBarSide) on the right', () => {
    const ui = load({ topBar: true, appConfig: { ...savedAppConfig(), workflowBarPos: 'top', mergeTopBar: true } });
    expect(ui.appConfig.mergeTopBar).toBe(true);
    expect(ui.appConfig.mergedTopBarSide).toBe('right');
  });

  it('does not turn the merge on for data saved before it existed (2.8.0-swh.31 or older)', () => {
    const ui = load({ topBar: true, appConfig: { ...savedAppConfig(), workflowBarPos: 'top' } });
    expect(isTopBarMerged(ui)).toBe(false);
    expect(ui.appConfig.mergedTopBarSide).toBe('right');
  });

  it('gives a missing Top Bar flag and bar position the old defaults (hidden, left)', () => {
    const { workflowBarPos: _p, ...appConfig } = savedAppConfig();
    const ui = load({ appConfig });
    expect(ui.topBar).toBe(false);
    expect(ui.appConfig.workflowBarPos).toBe('left');
  });

  it('keeps saved values', () => {
    const ui = load({ topBar: true, appConfig: { ...savedAppConfig(), workflowBarPos: 'top', mergeTopBar: true, mergedTopBarSide: 'left' } });
    expect(ui.appConfig.mergedTopBarSide).toBe('left');
    expect(isTopBarMerged(ui)).toBe(true);
  });

  it('leaves version 3 data to the new defaults', () => {
    const ui = load({ appConfig: savedAppConfig() }, 3);
    expect(ui.appConfig.mergeTopBar).toBe(true);
    expect(ui.appConfig.mergedTopBarSide).toBe('left');
  });
});
