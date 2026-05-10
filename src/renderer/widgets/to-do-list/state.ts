import { List } from '@/base/list';

export const maxTextLength = 1000;

export interface ToDoListItem {
  id: number;
  text: string;
  isDone: boolean;
}

export interface ToDoListState {
  items: List<ToDoListItem>;
  nextItemId: number;
}

export type ItemEditorId = 'add-top' | number | 'add-bottom'; // number = item id to edit
export type ActiveItemEditorState = { id: ItemEditorId } | null;

export type GetToDoListState = () => ToDoListState;
export type SetToDoListState = (newState: ToDoListState) => void;

export type SetActiveItemEditorState = (newState: ActiveItemEditorState) => void;

export function sanitizeLoadedToDoListState(raw: unknown): ToDoListState {
  if (typeof raw !== 'object' || raw === null) {
    return { items: [], nextItemId: 1 };
  }
  const r = raw as { items?: unknown; nextItemId?: unknown };
  if (!Array.isArray(r.items) || typeof r.nextItemId !== 'number') {
    return { items: [], nextItemId: 1 };
  }
  const items = r.items.flatMap((item: unknown): ToDoListItem[] => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const i = item as Partial<ToDoListItem>;
    if (typeof i.id === 'number' && typeof i.text === 'string' && typeof i.isDone === 'boolean') {
      return [{ id: i.id, text: i.text, isDone: i.isDone }];
    }
    return [];
  });
  return { items, nextItemId: r.nextItemId };
}
