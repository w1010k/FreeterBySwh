/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/widgets/appModules';
import { Settings } from '@/widgets/web-query/settings';
import { computeEntry } from '@/widgets/web-query/widget';

const query: WidgetAiAction<{ text: string; entry?: number }> = {
  name: 'query',
  description: 'Run a query like typing it into the widget: opens the search in the browser or in the workflow\'s webpage widgets. '
    + 'entry picks the query box (0 = first, see widget.get settings.entries).',
  kind: 'write',
  properties: { text: { type: 'string', minLength: 1 }, entry: { type: 'integer', minimum: 0 } },
  required: ['text'],
  parse: (input) => (typeof input.text === 'string' && input.text.trim() !== ''
    && (input.entry === undefined || (Number.isInteger(input.entry) && (input.entry as number) >= 0))
    ? { text: input.text, entry: input.entry as number | undefined }
    : undefined),
  describe: ({ text, entry }, widgetName, settings) => {
    const s = settings as Settings | undefined;
    const e = s?.entries?.[entry ?? 0];
    const label = e ? ` (${computeEntry(e, s.mode).descr})` : '';
    return `Run query "${text}"${label} in web query widget "${widgetName}"`;
  },
  run: ({ api }, { text, entry }) => {
    if (typeof api.query !== 'function') {
      return { ok: false, code: 'not_ready', message: 'The widget is not ready' };
    }
    return api.query(text, entry ?? 0)
      ? { ok: true, value: null }
      : { ok: false, code: 'not_found', message: `No configured query box ${entry ?? 0}` };
  }
};

export const webQueryAiActions: WidgetAiAction[] = [query] as WidgetAiAction[];
