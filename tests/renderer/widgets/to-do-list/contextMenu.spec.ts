/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createContextMenuFactory } from '@/widgets/to-do-list/contextMenu';
import { labelDeleteCompleted, labelMoveItemDown, labelMoveItemUp } from '@/widgets/to-do-list/actions';
import { ToDoListState } from '@/widgets/to-do-list/state';
import { fixtureSettings } from './fixtures';

function setup(confirmed: boolean) {
  let state: ToDoListState = {
    nextItemId: 3,
    items: [{ id: 1, text: 'done', isDone: true }, { id: 2, text: 'open', isDone: false }],
  };
  const setState = jest.fn((s: ToDoListState) => { state = s; });
  const confirm = jest.fn(async () => confirmed);
  const items = createContextMenuFactory(fixtureSettings({}), () => state, setState, jest.fn(), confirm)('', {});
  const deleteCompleted = items.find(item => item.label === labelDeleteCompleted)!;
  return { getState: () => state, setState, confirm, deleteCompleted };
}

describe('To-Do List context menu', () => {
  it('asks before deleting the completed items, naming how many', async () => {
    const { getState, confirm, deleteCompleted } = setup(true);

    await deleteCompleted.doAction!();

    expect(confirm).toHaveBeenCalledWith('Delete 1 completed item? This cannot be undone.', 'Delete Items');
    expect(getState().items.map(item => item.id)).toEqual([2]);
  });

  it('deletes only the items it asked about, not ones completed while the dialog was open', async () => {
    const { getState, setState } = setup(true);
    const confirmAfterAnotherCompletes = async () => {
      setState({ ...getState(), items: getState().items.map(item => ({ ...item, isDone: true })) });
      return true;
    };
    const items = createContextMenuFactory(fixtureSettings({}), getState, setState, jest.fn(), confirmAfterAnotherCompletes)('', {});

    await items.find(item => item.label === labelDeleteCompleted)!.doAction!();

    expect(getState().items.map(item => item.id)).toEqual([2]);
  });

  it('keeps an item that was marked incomplete while the dialog was open', async () => {
    const { getState, setState } = setup(true);
    const confirmAfterUncheck = async () => {
      setState({ ...getState(), items: getState().items.map(item => ({ ...item, isDone: false })) });
      return true;
    };
    const items = createContextMenuFactory(fixtureSettings({}), getState, setState, jest.fn(), confirmAfterUncheck)('', {});

    await items.find(item => item.label === labelDeleteCompleted)!.doAction!();

    expect(getState().items.map(item => item.id)).toEqual([1, 2]);
  });

  it('keeps the items when the user cancels', async () => {
    const { setState, deleteCompleted } = setup(false);

    await deleteCompleted.doAction!();

    expect(setState).not.toHaveBeenCalled();
  });
});

describe('To-Do List item menu', () => {
  it('moves an item up or down, and offers only the moves that exist', async () => {
    let state: ToDoListState = {
      nextItemId: 4,
      items: [{ id: 1, text: 'a', isDone: false }, { id: 2, text: 'b', isDone: false }, { id: 3, text: 'c', isDone: false }],
    };
    const setState = (s: ToDoListState) => { state = s; };
    const menu = (id: number) => createContextMenuFactory(fixtureSettings({}), () => state, setState, jest.fn(), jest.fn())(String(id), {});

    const first = menu(1);
    expect(first.find(item => item.label === labelMoveItemUp)?.enabled).toBe(false);
    await first.find(item => item.label === labelMoveItemDown)!.doAction!();
    expect(state.items.map(item => item.id)).toEqual([2, 1, 3]);

    await menu(3).find(item => item.label === labelMoveItemUp)!.doAction!();
    expect(state.items.map(item => item.id)).toEqual([2, 3, 1]);
    expect(menu(1).find(item => item.label === labelMoveItemDown)?.enabled).toBe(false);
  });
});
