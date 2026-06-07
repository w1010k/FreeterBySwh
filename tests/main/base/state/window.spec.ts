/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WindowState, prepareWindowState, createPersistentWindowState, mergeWindowStateWithPersistentWindowState, PersistentWindowState, isPersistentWindowState } from '@/base/state/window';
import { fixtureWindowState } from '@tests/base/state/fixtures/windowState';

describe('WindowState', () => {
  describe('prepareWindowState', () => {
    it('should return the state without changes', async () => {
      const state = fixtureWindowState({});

      const gotState = prepareWindowState(state);

      expect(gotState).toEqual(state);
    })
  })

  describe('createPersistentWindowState', () => {
    it('should return the state without changes', async () => {
      const state = fixtureWindowState({});

      const gotState = createPersistentWindowState(state);

      expect(gotState).toEqual(state);
    })
  })

  describe('mergeWindowStateWithPersistentWindowState', () => {
    it('correctly merges WindowState with all PersistentWindowState props', () => {
      const state = fixtureWindowState({
        isFull: false,
        x: 55
      })
      const persistentState: PersistentWindowState = {
        ...state,
        isFull: true,
        x: 77
      }
      const expectState: WindowState = {
        ...state,
        ...persistentState
      }

      const gotState = mergeWindowStateWithPersistentWindowState(state, persistentState);

      expect(gotState).toEqual(expectState);
    })
  })

  describe('isPersistentWindowState', () => {
    it('should return true for a well-formed state', () => {
      expect(isPersistentWindowState(fixtureWindowState({}))).toBe(true);
    })

    it('should return false when a numeric field is missing', () => {
      const { x: _x, ...rest } = fixtureWindowState({});
      expect(isPersistentWindowState(rest as PersistentWindowState)).toBe(false);
    })

    it('should return false when a boolean field has the wrong type', () => {
      const bad = { ...fixtureWindowState({}), isFull: 'nope' } as unknown as PersistentWindowState;
      expect(isPersistentWindowState(bad)).toBe(false);
    })
  })
})
