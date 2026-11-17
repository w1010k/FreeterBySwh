/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { applyActionBarLayout, arrangeActions, sanitizeActionBarLayout } from '@/widgets/webpage/actionLayout';

const items = ['A', 'B', 'C', 'D'].map(id => ({ id }));
const ids = (list: { id: string }[]) => list.map(item => item.id);

describe('sanitizeActionBarLayout()', () => {
  it('returns empty lists for a missing or broken value', () => {
    expect(sanitizeActionBarLayout(undefined)).toEqual({ hidden: [], order: [] });
    expect(sanitizeActionBarLayout('x')).toEqual({ hidden: [], order: [] });
    expect(sanitizeActionBarLayout({ hidden: 'A', order: null })).toEqual({ hidden: [], order: [] });
  });

  it('keeps only the string ids', () => {
    expect(sanitizeActionBarLayout({ hidden: ['A', 1, null], order: ['B', {}, 'C'] })).toEqual({ hidden: ['A'], order: ['B', 'C'] });
  });
});

describe('arrangeActions()', () => {
  it('keeps the default order when the saved order is empty', () => {
    expect(ids(arrangeActions(items, { hidden: [], order: [] }))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('follows the saved order', () => {
    expect(ids(arrangeActions(items, { hidden: [], order: ['D', 'B', 'A', 'C'] }))).toEqual(['D', 'B', 'A', 'C']);
  });

  it('puts items the order does not name after the named ones, in their default order', () => {
    expect(ids(arrangeActions(items, { hidden: [], order: ['C', 'A'] }))).toEqual(['C', 'A', 'B', 'D']);
  });

  it('ignores ids that no item has', () => {
    expect(ids(arrangeActions(items, { hidden: [], order: ['X', 'B', 'Y'] }))).toEqual(['B', 'A', 'C', 'D']);
  });
});

describe('applyActionBarLayout()', () => {
  it('drops the hidden items and arranges the rest', () => {
    expect(ids(applyActionBarLayout(items, { hidden: ['B', 'X'], order: ['D'] }))).toEqual(['D', 'A', 'C']);
  });
});
