/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { closeTab, emptyTabsState, openTab, parseTabsState } from '@/widgets/markdown-editor/tabs';

describe('Markdown Editor tabs', () => {
  describe('openTab()', () => {
    it('should append a new tab and activate it', () => {
      expect(openTab({ paths: ['/a.md'], active: '/a.md' }, '/b.md')).toEqual({ paths: ['/a.md', '/b.md'], active: '/b.md' });
    })

    it('should only activate a tab that is already open', () => {
      expect(openTab({ paths: ['/a.md', '/b.md'], active: '/b.md' }, '/a.md')).toEqual({ paths: ['/a.md', '/b.md'], active: '/a.md' });
    })
  })

  describe('closeTab()', () => {
    it('should keep the active tab when closing another one', () => {
      expect(closeTab({ paths: ['/a.md', '/b.md'], active: '/b.md' }, '/a.md')).toEqual({ paths: ['/b.md'], active: '/b.md' });
    })

    it('should activate the right neighbor when closing the active tab', () => {
      expect(closeTab({ paths: ['/a.md', '/b.md', '/c.md'], active: '/b.md' }, '/b.md')).toEqual({ paths: ['/a.md', '/c.md'], active: '/c.md' });
    })

    it('should activate the left neighbor when closing the last active tab', () => {
      expect(closeTab({ paths: ['/a.md', '/b.md'], active: '/b.md' }, '/b.md')).toEqual({ paths: ['/a.md'], active: '/a.md' });
    })

    it('should leave no active tab when closing the only tab', () => {
      expect(closeTab({ paths: ['/a.md'], active: '/a.md' }, '/a.md')).toEqual(emptyTabsState);
    })
  })

  describe('parseTabsState()', () => {
    it('should keep a valid stored state', () => {
      expect(parseTabsState({ paths: ['/a.md', '/b.md'], active: '/b.md' })).toEqual({ paths: ['/a.md', '/b.md'], active: '/b.md' });
    })

    it('should drop invalid and duplicate paths and fix a dangling active tab', () => {
      expect(parseTabsState({ paths: ['/a.md', 3, '', '/a.md'], active: '/gone.md' })).toEqual({ paths: ['/a.md'], active: '/a.md' });
    })

    it('should fall back to no tabs for malformed values', () => {
      expect(parseTabsState(undefined)).toEqual(emptyTabsState);
      expect(parseTabsState('x')).toEqual(emptyTabsState);
      expect(parseTabsState({ paths: 'x' })).toEqual(emptyTabsState);
    })
  })
})
