/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiControlProvider } from '@/application/interfaces/aiControlProvider';
import { AppStore } from '@/application/interfaces/store';
import { AiAction } from '@/base/ai/aiAction';
import { AiActionInfo, AiRpcRequest, AiRpcResult } from '@common/ai/protocol';
import { pointsToAnotherComputer } from '@/application/useCases/ai/actions/inputs';
import { beginUnconfirmedAiWrite, endUnconfirmedAiWrite } from '@/base/ai/aiActivity';
import { AppState } from '@/base/state/app';

type Deps = {
  actions: AiAction[];
  aiControl: AiControlProvider;
  appStore: AppStore;
}

/**
 * The confirm box must show everything the user approves. A longer text is refused
 * rather than cut, so nothing can hide past the cut (e.g. a script in a setting).
 */
export const AI_MAX_CONFIRM_TEXT = 4000;

const SETTINGS_WINDOW_OPEN = { ok: false, code: 'not_ready', message: 'A Freeter settings window is open; ask the user to close it, then retry' } as const;

/** The widgets on screen or mounted: the shelf and the active workflows (Memory Saver). */
function shownWidgetIds(state: AppState): Set<string> {
  const ids = new Set(state.ui.shelf.widgetList.map(item => item.widgetId));
  for (const { wflId } of state.ui.memSaver.activeWorkflows) {
    for (const item of state.entities.workflows[wflId]?.layout ?? []) {
      ids.add(item.widgetId);
    }
  }
  return ids;
}

export function createRunAiRequestUseCase({ actions, aiControl, appStore }: Deps) {
  /** A settings window holds a draft that would overwrite an AI write when the user saves it. */
  const settingsWindowOpen = () => appStore.get().ui.modalScreens.order.length > 0;
  /** `reqId` ties the confirm box to the request, so main can close it if the request is dropped. */
  return async function runAiRequestUseCase(req: AiRpcRequest, reqId: number): Promise<AiRpcResult> {
    if (req.method === 'actions.list') {
      const infos: AiActionInfo[] = actions.map(({ id, description, kind, inputSchema }) => ({ id, description, kind, inputSchema }));
      return { ok: true, value: infos };
    }
    if (appStore.get().isLoading) {
      return { ok: false, code: 'not_ready', message: 'Freeter is still loading' };
    }
    const action = actions.find(a => a.id === req.params.actionId);
    if (!action) {
      return { ok: false, code: 'unknown_action', message: `Unknown action: ${req.params.actionId}` };
    }
    try {
      const input = action.parse(req.params.input ?? {});
      if (input === undefined) {
        return { ok: false, code: 'invalid_input', message: `Invalid input for ${action.id}` };
      }
      if (action.kind === 'write') {
        // A settings window keeps a draft of the state; its Save would undo this write.
        if (settingsWindowOpen()) {
          return SETTINGS_WINDOW_OPEN;
        }
        // "Always allow" (off by default) skips the box for every write but alwaysConfirm ones, deletes included:
        // the user chose that; only what can run programs or send data off the PC keeps asking (decisions.md D77).
        // A path to another computer in any input also asks: Windows sends the login hash when it opens one.
        const needsBox = () => !appStore.get().ui.appConfig.aiAlwaysAllow || action.alwaysConfirm?.(input) === true
          || pointsToAnotherComputer(input);
        let ask = needsBox();
        if (!ask) {
          // The confirm path checks this through its box (main closes it); without a box, ask main directly.
          if (!await aiControl.alive(reqId)) {
            return { ok: false, code: 'failed', message: 'The request was cancelled' };
          }
          if (settingsWindowOpen()) {
            return SETTINGS_WINDOW_OPEN;
          }
          // The user may have turned "always allow" off meanwhile: then the box is shown after all.
          ask = needsBox();
        }
        if (!ask) {
          // A Terminal this write newly shows does not start by itself (the user starts it).
          const shownBefore = shownWidgetIds(appStore.get());
          const write = beginUnconfirmedAiWrite(shownBefore);
          try {
            return await action.run(input, { confirmed: false });
          } finally {
            const after = appStore.get();
            // Only widgets that run programs read the mark (a Terminal); others would only fill the bounded list.
            const runsPrograms = (id: string) => !!after.entities.widgetTypes[after.entities.widgets[id]?.type ?? '']?.runsPrograms;
            endUnconfirmedAiWrite(write, [...shownWidgetIds(after)].filter(id => !shownBefore.has(id) && runsPrograms(id)));
          }
        }
        const text = action.describe(input);
        if (text.length > AI_MAX_CONFIRM_TEXT) {
          return { ok: false, code: 'invalid_input', message: 'Too long to show in the confirm box; make smaller changes' };
        }
        if (!await aiControl.confirm(reqId, req.params.origin, text)) {
          return { ok: false, code: 'denied', message: 'The user denied the action' };
        }
        // What runs must be what the user saw: settings may have changed while the box was open.
        if (action.describe(input) !== text || settingsWindowOpen()) {
          return { ok: false, code: 'failed', message: 'Freeter changed while the confirm box was open; nothing was done. Retry.' };
        }
        return await action.run(input, { confirmed: true });
      }
      return await action.run(input);
    } catch (err) {
      return { ok: false, code: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export type RunAiRequestUseCase = ReturnType<typeof createRunAiRequestUseCase>;
