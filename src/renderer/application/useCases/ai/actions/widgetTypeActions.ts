/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { asRecord, idSchema, isNonEmptyString, notFound } from '@/application/useCases/ai/actions/inputs';
import { AiAction } from '@/base/ai/aiAction';
import { getWidgetDisplayName } from '@/base/widget';
import { WidgetType } from '@/base/widgetType';

type Deps = {
  appStore: AppStore;
  /** From the registry: the action list is fixed for the app's lifetime. */
  widgetTypes: readonly WidgetType[];
}

type Input = { widgetId: string; input: unknown };

/** Turns each WidgetType.aiActions entry into an app-level AiAction '<type>.<name>'. */
export function createWidgetTypeAiActions({ appStore, widgetTypes }: Deps): AiAction[] {
  return widgetTypes.flatMap(widgetType => (widgetType.aiActions ?? []).map((action): AiAction<Input> => ({
    id: `${widgetType.id}.${action.name}`,
    description: `${widgetType.name} widget: ${action.description}`,
    kind: action.kind,
    inputSchema: {
      type: 'object',
      properties: { widgetId: idSchema, ...action.properties },
      required: ['widgetId', ...(action.required ?? [])]
    },
    parse: (raw) => {
      const o = asRecord(raw);
      if (!o || !isNonEmptyString(o.widgetId)) {
        return undefined;
      }
      const { widgetId, ...rest } = o;
      const input = action.parse(rest);
      return input === undefined ? undefined : { widgetId, input };
    },
    describe: ({ widgetId, input }) => {
      const { widgets } = appStore.get().entities;
      const widget = widgets[widgetId];
      return action.describe(input, widget ? getWidgetDisplayName(widget, widgetType) : widgetId, widget?.settings);
    },
    run: ({ widgetId, input }) => {
      const widget = appStore.get().entities.widgets[widgetId];
      if (!widget || widget.type !== widgetType.id) {
        return notFound(`${widgetType.name} widget`, widgetId);
      }
      const api = asRecord(widget.exposedApi);
      if (!api || Object.keys(api).length === 0) {
        return {
          ok: false,
          code: 'not_ready',
          message: 'The widget is not loaded (its workflow was unloaded to save memory). Show it with workflow.switch, then retry.'
        };
      }
      return action.run({ api, settings: widget.settings }, input);
    }
  })));
}
