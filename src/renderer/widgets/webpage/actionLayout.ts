/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Which action bar buttons the user hid, and the order they put them in. Both lists hold
// action bar item ids. The code knows nothing about the Webpage widget, so another widget
// can use it as is.
export interface ActionBarLayout {
  hidden: string[];
  order: string[];
}

function sanitizeIdList(val: unknown): string[] {
  return Array.isArray(val) ? val.filter((id): id is string => typeof id === 'string') : [];
}

export function sanitizeActionBarLayout(val: unknown): ActionBarLayout {
  const { hidden, order } = (typeof val === 'object' && val !== null ? val : {}) as { hidden?: unknown; order?: unknown };
  return { hidden: sanitizeIdList(hidden), order: sanitizeIdList(order) };
}

// Sorts the items by the saved order. An item the order does not name (a button an update
// added, a new custom action) keeps its default place relative to the other such items and
// goes after the named ones. An empty order keeps the default order.
export function arrangeActions<T extends { id: string }>(items: readonly T[], layout: ActionBarLayout): T[] {
  const rank = new Map(layout.order.map((id, i) => [id, i]));
  const rankOf = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rankOf(a.item.id) - rankOf(b.item.id) || a.i - b.i)
    .map(({ item }) => item);
}

// The buttons the action bar shows: arranged, without the hidden ones.
export function applyActionBarLayout<T extends { id: string }>(items: readonly T[], layout: ActionBarLayout): T[] {
  return arrangeActions(items, layout).filter(item => !layout.hidden.includes(item.id));
}
