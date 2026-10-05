/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { buildChildEntries, isSameOrDescendantKey } from '@/widgets/markdown-editor/treeModel';

describe('Markdown Editor tree model', () => {
  describe('buildChildEntries()', () => {
    it('should keep folders and Markdown files only, keyed relative to the parent', () => {
      const entries = buildChildEntries('docs', [
        { name: 'plans', path: '/r/docs/plans', isDirectory: true, size: 0 },
        { name: 'a.md', path: '/r/docs/a.md', isDirectory: false, size: 1 },
        { name: 'B.MARKDOWN', path: '/r/docs/B.MARKDOWN', isDirectory: false, size: 1 },
        { name: 'a.md.tmp', path: '/r/docs/a.md.tmp', isDirectory: false, size: 1 },
        { name: 'image.png', path: '/r/docs/image.png', isDirectory: false, size: 1 },
      ]);

      expect(entries).toEqual([
        { key: 'docs/plans', path: '/r/docs/plans', isDirectory: true },
        { key: 'docs/a.md', path: '/r/docs/a.md', isDirectory: false },
        { key: 'docs/B.MARKDOWN', path: '/r/docs/B.MARKDOWN', isDirectory: false },
      ]);
    })

    it('should use bare names at the top level', () => {
      expect(buildChildEntries('', [{ name: 'a.md', path: '/r/a.md', isDirectory: false, size: 1 }]))
        .toEqual([{ key: 'a.md', path: '/r/a.md', isDirectory: false }]);
    })
  })

  describe('isSameOrDescendantKey()', () => {
    it('should match the key itself and keys below it, not siblings sharing a prefix', () => {
      expect(isSameOrDescendantKey('docs', 'docs')).toBe(true);
      expect(isSameOrDescendantKey('docs/a.md', 'docs')).toBe(true);
      expect(isSameOrDescendantKey('docs2/a.md', 'docs')).toBe(false);
    })
  })
})
