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

export function createRunAiRequestUseCase({ actions, aiControl, appStore }: Deps) {
  return async function runAiRequestUseCase(req: AiRpcRequest): Promise<AiRpcResult> {
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
    const input = action.parse(req.params.input ?? {});
    if (input === undefined) {
      return { ok: false, code: 'invalid_input', message: `Invalid input for ${action.id}` };
    }
    try {
      if (action.kind === 'write' && !await aiControl.confirm(req.params.origin, action.describe(input))) {
        return { ok: false, code: 'denied', message: 'The user denied the action' };
      }
      return await action.run(input);
    } catch (err) {
      return { ok: false, code: 'failed', message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export type RunAiRequestUseCase = ReturnType<typeof createRunAiRequestUseCase>;
