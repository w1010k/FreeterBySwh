/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult, WidgetAiAction, WidgetAiActionContext } from '@/widgets/appModules';

/** What the mounted Note widget exposes for AI actions (widget.tsx). */
export interface NoteAiApi {
  /** undefined while the note is loading. */
  get(): string | undefined;
  /** Shows and saves the text like a user edit. false while the user is typing in the note. */
  set(text: string): boolean;
}

function withNote(ctx: WidgetAiActionContext, fn: (api: NoteAiApi, text: string) => AiRpcResult): AiRpcResult {
  const api = ctx.api.note as NoteAiApi | undefined;
  const text = api?.get();
  if (!api || text === undefined) {
    return { ok: false, code: 'not_ready', message: 'The note is still loading' };
  }
  return fn(api, text);
}

const save = (api: NoteAiApi, text: string): AiRpcResult => (api.set(text)
  ? { ok: true, value: null }
  : { ok: false, code: 'failed', message: 'The user is typing in this note; try again later' });

const getText: WidgetAiAction<Record<string, never>> = {
  name: 'getText',
  description: 'Read the text of the note.',
  kind: 'read',
  properties: {},
  parse: () => ({}),
  describe: (_input, widgetName) => `Read note "${widgetName}"`,
  run: (ctx) => withNote(ctx, (_api, text) => ({ ok: true, value: { text } })),
};

const setText: WidgetAiAction<{ text: string }> = {
  name: 'setText',
  description: 'Replace the whole text of the note.',
  kind: 'write',
  properties: { text: { type: 'string' } },
  required: ['text'],
  parse: (input) => (typeof input.text === 'string' ? { text: input.text } : undefined),
  describe: ({ text }, widgetName) => `Replace the text of note "${widgetName}" (${text.length} characters)`,
  run: (ctx, { text }) => withNote(ctx, api => save(api, text)),
};

const appendText: WidgetAiAction<{ text: string }> = {
  name: 'appendText',
  description: 'Add text at the end of the note, on a new line.',
  kind: 'write',
  properties: { text: { type: 'string', minLength: 1 } },
  required: ['text'],
  parse: (input) => (typeof input.text === 'string' && input.text !== '' ? { text: input.text } : undefined),
  describe: ({ text }, widgetName) => `Append ${text.length} characters to note "${widgetName}"`,
  run: (ctx, { text }) => withNote(ctx, (api, current) => save(api, current === '' ? text : `${current}\n${text}`)),
};

export const noteAiActions: WidgetAiAction[] = [getText, setText, appendText] as WidgetAiAction[];
