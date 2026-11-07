/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult, WidgetAiAction, WidgetAiActionContext } from '@/widgets/appModules';
import { addItem, deleteItem, editItem, markComplete, markIncomplete } from '@/widgets/to-do-list/actions';
import { maxTextLength, ToDoListState } from '@/widgets/to-do-list/state';

/** What the mounted To-Do List widget exposes for AI actions (widget.tsx). */
export interface ToDoListAiApi {
  get(): ToDoListState | undefined;
  /** Same path as a user edit: shared store + debounced save. */
  set(state: ToDoListState): void;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= maxTextLength;
const isItemId = (v: unknown): v is number => Number.isInteger(v);

/** Runs `fn` with the widget's list, or answers not_ready while the list is still loading. */
function withList(ctx: WidgetAiActionContext, fn: (api: ToDoListAiApi, list: ToDoListState) => AiRpcResult): AiRpcResult {
  const api = ctx.api.todo as ToDoListAiApi | undefined;
  const list = api?.get();
  if (!api || !list) {
    return { ok: false, code: 'not_ready', message: 'The to-do list is still loading' };
  }
  return fn(api, list);
}

const withItem = (ctx: WidgetAiActionContext, itemId: number, fn: (api: ToDoListAiApi, list: ToDoListState) => void): AiRpcResult =>
  withList(ctx, (api, list) => {
    if (!list.items.some(i => i.id === itemId)) {
      return { ok: false, code: 'not_found', message: `No item with id ${itemId}` };
    }
    fn(api, list);
    return { ok: true, value: null };
  });

const getItems: WidgetAiAction<Record<string, never>> = {
  name: 'getItems',
  description: 'List the items: id, text, done.',
  kind: 'read',
  properties: {},
  parse: () => ({}),
  describe: (_input, widgetName) => `Read to-do list "${widgetName}"`,
  run: (ctx) => withList(ctx, (_api, list) => ({ ok: true, value: list.items.map(i => ({ id: i.id, text: i.text, done: i.isDone })) })),
};

const addItemAction: WidgetAiAction<{ text: string; atTop?: boolean }> = {
  name: 'addItem',
  description: `Add an item (max ${maxTextLength} characters) at the bottom, or at the top with atTop.`,
  kind: 'write',
  properties: { text: { type: 'string', minLength: 1, maxLength: maxTextLength }, atTop: { type: 'boolean' } },
  required: ['text'],
  parse: (input) => (isText(input.text) && (input.atTop === undefined || typeof input.atTop === 'boolean')
    ? { text: input.text, atTop: input.atTop }
    : undefined),
  describe: ({ text }, widgetName) => `Add "${text}" to to-do list "${widgetName}"`,
  run: (ctx, { text, atTop }) => withList(ctx, (api, list) => {
    addItem(text, atTop === true, () => list, api.set);
    return { ok: true, value: { itemId: list.nextItemId } };
  }),
};

const setDone: WidgetAiAction<{ itemId: number; done: boolean }> = {
  name: 'setDone',
  description: 'Mark an item done or not done.',
  kind: 'write',
  properties: { itemId: { type: 'integer' }, done: { type: 'boolean' } },
  required: ['itemId', 'done'],
  parse: (input) => (isItemId(input.itemId) && typeof input.done === 'boolean' ? { itemId: input.itemId, done: input.done } : undefined),
  describe: ({ itemId, done }, widgetName) => `Mark item ${itemId} ${done ? 'done' : 'not done'} in to-do list "${widgetName}"`,
  run: (ctx, { itemId, done }) => withItem(ctx, itemId, (api, list) => {
    const doneToBottom = (ctx.settings as { doneToBottom?: unknown } | undefined)?.doneToBottom === true;
    if (done) {
      markComplete(itemId, doneToBottom, () => list, api.set);
    } else {
      markIncomplete(itemId, () => list, api.set);
    }
  }),
};

const editItemAction: WidgetAiAction<{ itemId: number; text: string }> = {
  name: 'editItem',
  description: 'Change the text of an item.',
  kind: 'write',
  properties: { itemId: { type: 'integer' }, text: { type: 'string', minLength: 1, maxLength: maxTextLength } },
  required: ['itemId', 'text'],
  parse: (input) => (isItemId(input.itemId) && isText(input.text) ? { itemId: input.itemId, text: input.text } : undefined),
  describe: ({ itemId, text }, widgetName) => `Change item ${itemId} to "${text}" in to-do list "${widgetName}"`,
  run: (ctx, { itemId, text }) => withItem(ctx, itemId, (api, list) => editItem(itemId, text, () => list, api.set)),
};

const deleteItemAction: WidgetAiAction<{ itemId: number }> = {
  name: 'deleteItem',
  description: 'Delete an item.',
  kind: 'write',
  properties: { itemId: { type: 'integer' } },
  required: ['itemId'],
  parse: (input) => (isItemId(input.itemId) ? { itemId: input.itemId } : undefined),
  describe: ({ itemId }, widgetName) => `Delete item ${itemId} from to-do list "${widgetName}"`,
  run: (ctx, { itemId }) => withItem(ctx, itemId, (api, list) => deleteItem(itemId, () => list, api.set)),
};

export const toDoListAiActions: WidgetAiAction[] = [getItems, addItemAction, setDone, editItemAction, deleteItemAction] as WidgetAiAction[];
