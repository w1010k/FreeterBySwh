/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiControlProvider } from '@/application/interfaces/aiControlProvider';
import { AppStore } from '@/application/interfaces/store';
import { AiAction } from '@/base/ai/aiAction';
import { AiActionInfo, AiRpcRequest, AiRpcResult } from '@common/ai/protocol';

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

export function createRunAiRequestUseCase({ actions, aiControl, appStore }: Deps) {
  /** `reqId` ties the confirm box to the request, so main can close it if the request is dropped. */
  return async function runAiRequestUseCase(req: AiRpcRequest, reqId = 0): Promise<AiRpcResult> {
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
        if (appStore.get().ui.modalScreens.order.length > 0) {
          return { ok: false, code: 'not_ready', message: 'A Freeter settings window is open; ask the user to close it, then retry' };
        }
        const text = action.describe(input);
        if (text.length > AI_MAX_CONFIRM_TEXT) {
          return { ok: false, code: 'invalid_input', message: 'Too long to show in the confirm box; make smaller changes' };
        }
        if (!await aiControl.confirm(reqId, req.params.origin, text)) {
          return { ok: false, code: 'denied', message: 'The user denied the action' };
        }
        // What runs must be what the user saw: settings may have changed while the box was open.
        if (action.describe(input) !== text || appStore.get().ui.modalScreens.order.length > 0) {
          return { ok: false, code: 'failed', message: 'Freeter changed while the confirm box was open; nothing was done. Retry.' };
        }
      }
      return await action.run(input);
    } catch (err) {
      return { ok: false, code: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export type RunAiRequestUseCase = ReturnType<typeof createRunAiRequestUseCase>;
