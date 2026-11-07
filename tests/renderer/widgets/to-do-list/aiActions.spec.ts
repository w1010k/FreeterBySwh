/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { toDoListAiActions } from '@/widgets/to-do-list/aiActions';
import { ToDoListState } from '@/widgets/to-do-list/state';
import { WidgetAiAction } from '@/base/ai/widgetAiAction';

function setup(initial: ToDoListState | undefined, doneToBottom = false) {
  let state = initial;
  const api = { todo: { get: () => state, set: (s: ToDoListState) => { state = s; } } };
  const get = (name: string) => toDoListAiActions.find(a => a.name === name) as WidgetAiAction;
  const exec = (name: string, input: Record<string, unknown>) => {
    const parsed = get(name).parse(input);
    if (parsed === undefined) {
      throw new Error('parse failed');
    }
    return Promise.resolve(get(name).run({ api, settings: { doneToBottom } }, parsed));
  };
  return { get, exec, state: () => state };
}

const twoItems: ToDoListState = { items: [{ id: 1, text: 'a', isDone: false }, { id: 2, text: 'b', isDone: false }], nextItemId: 3 };

describe('toDoListAiActions', () => {
  it('getItems lists items', async () => {
    const { exec } = setup(twoItems);
    await expect(exec('getItems', {})).resolves.toEqual({ ok: true, value: [{ id: 1, text: 'a', done: false }, { id: 2, text: 'b', done: false }] });
  });

  it('returns not_ready while the list is still loading', async () => {
    const { exec } = setup(undefined);
    await expect(exec('getItems', {})).resolves.toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('addItem adds at the bottom by default and at the top on request', async () => {
    const { exec, state } = setup(twoItems);
    await expect(exec('addItem', { text: 'c' })).resolves.toEqual({ ok: true, value: { itemId: 3 } });
    await exec('addItem', { text: 'd', atTop: true });
    expect(state()?.items.map(i => i.text)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('setDone completes and reopens an item, moving it to the bottom when the setting says so', async () => {
    const { exec, state } = setup(twoItems, true);
    await exec('setDone', { itemId: 1, done: true });
    expect(state()?.items).toEqual([{ id: 2, text: 'b', isDone: false }, { id: 1, text: 'a', isDone: true }]);
    await exec('setDone', { itemId: 1, done: false });
    expect(state()?.items.find(i => i.id === 1)?.isDone).toBe(false);
  });

  it('editItem and deleteItem change the item, and return not_found for an unknown item', async () => {
    const { exec, state } = setup(twoItems);
    await exec('editItem', { itemId: 2, text: 'B' });
    await exec('deleteItem', { itemId: 1 });
    expect(state()?.items).toEqual([{ id: 2, text: 'B', isDone: false }]);
    await expect(exec('deleteItem', { itemId: 9 })).resolves.toMatchObject({ code: 'not_found' });
    await expect(exec('setDone', { itemId: 9, done: true })).resolves.toMatchObject({ code: 'not_found' });
  });

  it('parse rejects empty or too long text and non-integer ids', () => {
    const { get } = setup(twoItems);
    expect(get('addItem').parse({ text: ' ' })).toBeUndefined();
    expect(get('addItem').parse({ text: 'x'.repeat(1001) })).toBeUndefined();
    expect(get('addItem').parse({ text: 'x', atTop: 'yes' })).toBeUndefined();
    expect(get('setDone').parse({ itemId: 1.5, done: true })).toBeUndefined();
    expect(get('deleteItem').parse({ itemId: '1' })).toBeUndefined();
  });

  it('describes writes for the confirm dialog', () => {
    const { get } = setup(twoItems);
    expect(get('addItem').describe({ text: 'milk' }, 'Groceries', {})).toBe('Add "milk" to to-do list "Groceries"');
    expect(get('setDone').describe({ itemId: 1, done: true }, 'G', {})).toBe('Mark item 1 done in to-do list "G"');
    expect(get('deleteItem').describe({ itemId: 1 }, 'G', {})).toBe('Delete item 1 from to-do list "G"');
  });
});
