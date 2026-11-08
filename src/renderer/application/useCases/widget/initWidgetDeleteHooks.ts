/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';

type Deps = {
  appStore: AppStore;
}

/**
 * Widgets leave the state in many places (delete widget, workflow, project, Project Manager,
 * AI actions); one watcher tells the widget type, so it can end what runs outside its view.
 */
export function createInitWidgetDeleteHooksUseCase({ appStore }: Deps) {
  return () => {
    // Runs only when the widgets collection object changes; a scan of its keys (hundreds at most) costs microseconds.
    // A size check would miss a delete and an add in one change.
    appStore.subscribeWithStrictEq(state => state.entities.widgets, (widgets, prev) => {
      for (const id of Object.keys(prev)) {
        const widget = prev[id];
        if (widget && !widgets[id]) {
          appStore.get().entities.widgetTypes[widget.type]?.onDeleted?.(id);
        }
      }
    });
  };
}

export type InitWidgetDeleteHooksUseCase = ReturnType<typeof createInitWidgetDeleteHooksUseCase>;
