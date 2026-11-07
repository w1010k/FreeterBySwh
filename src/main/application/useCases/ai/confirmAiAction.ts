/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiOrigin } from '@common/ai/protocol';

type Deps = {
  showWindow: () => void;
  /** Resolves true only for "Allow". Aborting the signal closes the box. */
  showConfirmBox: (message: string, signal: AbortSignal) => Promise<boolean>;
  timeoutMs: number;
}

export function createConfirmAiActionUseCase({ showWindow, showConfirmBox, timeoutMs }: Deps) {
  // One box at a time: each confirm waits for the previous one to settle.
  let queue: Promise<unknown> = Promise.resolve();

  const ask = async (origin: AiOrigin, describe: string, controller: AbortController): Promise<boolean> => {
    if (controller.signal.aborted) {
      // Its time ran out while an earlier box was open: the caller has given up already.
      return false;
    }
    try {
      showWindow();
      return await showConfirmBox(`An AI agent (via ${origin}) wants to: ${describe}`, controller.signal) && !controller.signal.aborted;
    } catch {
      return false;
    }
  };

  /** `dropped`: the request ended (its caller left or it timed out); its box must close. */
  return function confirmAiActionUseCase(origin: AiOrigin, describe: string, dropped?: AbortSignal): Promise<boolean> {
    // The limit counts from the request, not from when its box shows: a queued confirm must
    // settle before the bridge's own timeout, or a late Allow would run an action the
    // client was already told had timed out.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onDropped = () => controller.abort();
    if (dropped?.aborted) {
      controller.abort();
    }
    dropped?.addEventListener('abort', onDropped);
    const res = queue.then(() => ask(origin, describe, controller)).finally(() => {
      clearTimeout(timer);
      dropped?.removeEventListener('abort', onDropped);
    });
    queue = res;
    return res;
  };
}

export type ConfirmAiActionUseCase = ReturnType<typeof createConfirmAiActionUseCase>;
