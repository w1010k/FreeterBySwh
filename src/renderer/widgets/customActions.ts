/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import type { ActionBarItem } from '@/widgets/appModules';
import { ActionBarLayout, sanitizeActionBarLayout } from './actionLayout';

// User-made action bar buttons (the Actions setting of the Webpage and Terminal widgets). Each
// has a fixed id, a name, and one text field the widget runs: a script (`js`) or keys to type (`input`).
export type CustomAction<K extends string> = { id: string; name: string } & Record<K, string>;

// A built-in button as the Actions setting lists it.
export interface BuiltinActionInfo {
  id: string;
  label: string;
  note?: string;
}

// A custom action's id in the action bar and in ActionBarLayout. The action's own id is fixed,
// so the button keeps its place and hidden state when rows above it are deleted.
export const customActionItemIdPrefix = 'CUSTOM-ACTION-';
export function customActionItemId(action: { id: string }): string {
  return customActionItemIdPrefix + action.id;
}

let customActionIdCounter = 0;
export function genCustomActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  customActionIdCounter += 1;
  return `a${Date.now()}-${customActionIdCounter}`;
}

// An action without an id (Webpage actions saved before CHANGES #115, an AI agent's write) gets
// one here, and it is saved with the next state save. A repeated id gets a new one too.
export function sanitizeCustomActions<K extends string>(val: unknown, field: K): CustomAction<K>[] {
  if (!Array.isArray(val)) {
    return [];
  }
  const usedIds = new Set<string>();
  return val
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map(a => {
      const id = typeof a.id === 'string' && a.id !== '' && !usedIds.has(a.id) ? a.id : genCustomActionId();
      usedIds.add(id);
      const value = a[field];
      return { id, name: typeof a.name === 'string' ? a.name : '', [field]: typeof value === 'string' ? value : '' } as CustomAction<K>;
    });
}

// The action bar buttons of the custom actions, in list order. An action whose field `skip`s
// gets no button; one without a name is called "Custom action <its row number>".
export function customActionBarItems<K extends string>(
  actions: readonly CustomAction<K>[],
  field: K,
  make: { icon: string; enabled?: boolean; skip: (value: string) => boolean; run: (value: string) => void }
): ActionBarItem[] {
  return actions
    .map((action, i) => ({ action, i }))
    .filter(({ action }) => !make.skip(action[field]))
    .map(({ action, i }) => ({
      enabled: make.enabled ?? true,
      icon: make.icon,
      id: customActionItemId(action),
      title: action.name.trim() !== '' ? action.name : `Custom action ${i + 1}`,
      doAction: async () => make.run(action[field])
    }));
}

// The saved layout without the ids of custom actions that no longer exist (an AI agent that
// rewrites the actions without ids gives them new ones), so the saved lists hold only live ids.
export function sanitizeActionBarLayoutFor(val: unknown, customActions: readonly { id: string }[]): ActionBarLayout {
  const layout = sanitizeActionBarLayout(val);
  const live = new Set(customActions.map(customActionItemId));
  const isLive = (id: string) => !id.startsWith(customActionItemIdPrefix) || live.has(id);
  return { hidden: layout.hidden.filter(isLive), order: layout.order.filter(isLive) };
}
