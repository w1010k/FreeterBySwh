/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { sanitizeLoadedToDoListState } from '@/widgets/to-do-list/state';

describe('sanitizeLoadedToDoListState', () => {
  it('returns an empty state for non-object input', () => {
    expect(sanitizeLoadedToDoListState(null)).toEqual({ items: [], nextItemId: 1 });
    expect(sanitizeLoadedToDoListState(undefined)).toEqual({ items: [], nextItemId: 1 });
    expect(sanitizeLoadedToDoListState('string')).toEqual({ items: [], nextItemId: 1 });
    expect(sanitizeLoadedToDoListState(42)).toEqual({ items: [], nextItemId: 1 });
  });

  it('returns an empty state when items is not an array', () => {
    expect(sanitizeLoadedToDoListState({ items: null, nextItemId: 5 })).toEqual({ items: [], nextItemId: 1 });
    expect(sanitizeLoadedToDoListState({ items: 'oops', nextItemId: 5 })).toEqual({ items: [], nextItemId: 1 });
  });

  it('returns an empty state when nextItemId is not a number', () => {
    expect(sanitizeLoadedToDoListState({ items: [], nextItemId: 'x' })).toEqual({ items: [], nextItemId: 1 });
    expect(sanitizeLoadedToDoListState({ items: [] })).toEqual({ items: [], nextItemId: 1 });
  });

  it('keeps well-formed items and drops malformed ones', () => {
    const result = sanitizeLoadedToDoListState({
      items: [
        { id: 1, text: 'ok', isDone: false },
        { id: 'bad-id', text: 'oops', isDone: true },
        null,
        { id: 2, text: 'also ok', isDone: true },
        { id: 3, text: 5, isDone: false },
        { id: 4, text: 'missing isDone' },
      ],
      nextItemId: 99,
    });
    expect(result).toEqual({
      items: [
        { id: 1, text: 'ok', isDone: false },
        { id: 2, text: 'also ok', isDone: true },
      ],
      nextItemId: 99,
    });
  });

  it('strips extra properties from items', () => {
    const result = sanitizeLoadedToDoListState({
      items: [{ id: 1, text: 'ok', isDone: false, extra: 'should-be-dropped' }],
      nextItemId: 2,
    });
    expect(result.items[0]).toEqual({ id: 1, text: 'ok', isDone: false });
    expect(result.items[0]).not.toHaveProperty('extra');
  });
});
