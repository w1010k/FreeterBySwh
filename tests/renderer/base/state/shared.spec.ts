/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppAInColl } from '@tests/base/state/fixtures/entitiesState';
import { fixtureApps } from '@tests/base/state/fixtures/apps';
import { SharedState, createSharedState, sharedStateEquals } from '@/base/state/shared';

describe('Shared State', () => {
  describe('createSharedState', () => {
    it('should create an empty object, if availableSlices is empty', async () => {
      const state = fixtureAppState({
        entities: {
          apps: {
            ...fixtureAppAInColl()
          }
        },
        ui: {
          apps: fixtureApps({
            appIds: ['SOME-APP-ID']
          })
        }
      });
      const expectRes: Partial<SharedState> = {
      }

      const gotState = createSharedState(state, []);

      expect(gotState).toEqual(expectRes);
    })

    it('should add the apps state slice, if availableSlices has apps', async () => {
      const state = fixtureAppState({
        entities: {
          apps: {
            ...fixtureAppAInColl()
          }
        },
        ui: {
          apps: fixtureApps({
            appIds: ['SOME-APP-ID']
          })
        }
      });
      const expectRes: Partial<SharedState> = {
        apps: {
          appIds: state.ui.apps.appIds,
          apps: state.entities.apps
        }
      }

      const gotState = createSharedState(state, ['apps']);

      expect(gotState).toEqual(expectRes);
    })
  })

  describe('sharedStateEquals', () => {
    function fixtureStateWithApps(appIds: string[]) {
      return fixtureAppState({
        entities: {
          apps: {
            ...fixtureAppAInColl()
          }
        },
        ui: {
          apps: fixtureApps({ appIds })
        }
      });
    }

    it('should treat two empty shared states as equal (no requiresState case)', () => {
      const state = fixtureStateWithApps(['SOME-APP-ID']);

      const a = createSharedState(state, []);
      const b = createSharedState(state, []);

      // fresh wrapper objects, but no slices -> equal
      expect(a).not.toBe(b);
      expect(sharedStateEquals(a, b)).toBe(true);
    })

    it('should treat slices built from the same (unchanged) sources as equal, despite fresh wrappers', () => {
      const state = fixtureStateWithApps(['SOME-APP-ID']);

      const a = createSharedState(state, ['apps']);
      const b = createSharedState(state, ['apps']);

      // createSharedState builds new wrapper + new slice objects each call...
      expect(a).not.toBe(b);
      expect(a.apps).not.toBe(b.apps);
      // ...but the underlying source references are identical -> equal -> no re-render
      expect(sharedStateEquals(a, b)).toBe(true);
    })

    it('should report inequality when a slice source reference changes (appIds list replaced)', () => {
      const stateA = fixtureStateWithApps(['SOME-APP-ID']);
      const stateB = fixtureStateWithApps(['OTHER-APP-ID']);

      const a = createSharedState(stateA, ['apps']);
      const b = createSharedState(stateB, ['apps']);

      // appIds is a different array reference -> not equal -> re-render (no stale data)
      expect(sharedStateEquals(a, b)).toBe(false);
    })

    it('should report inequality when the entities collection reference changes', () => {
      const stateA = fixtureStateWithApps(['SOME-APP-ID']);
      const stateB = fixtureAppState({
        entities: {
          apps: {} // different collection reference
        },
        ui: {
          apps: fixtureApps({ appIds: stateA.ui.apps.appIds })
        }
      });

      const a = createSharedState(stateA, ['apps']);
      const b = createSharedState(stateB, ['apps']);

      expect(sharedStateEquals(a, b)).toBe(false);
    })

    it('should be reference-identity short-circuit when given the same object', () => {
      const state = fixtureStateWithApps(['SOME-APP-ID']);
      const a = createSharedState(state, ['apps']);

      expect(sharedStateEquals(a, a)).toBe(true);
    })

    it('should report inequality when slice sets differ', () => {
      const state = fixtureStateWithApps(['SOME-APP-ID']);

      const a = createSharedState(state, ['apps']);
      const b = createSharedState(state, ['apps', 'sharedDataKeys']);

      expect(sharedStateEquals(a, b)).toBe(false);
    })
  })
})
