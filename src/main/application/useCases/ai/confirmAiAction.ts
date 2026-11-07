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

  const ask = async (origin: AiOrigin, describe: string): Promise<boolean> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      showWindow();
      return await showConfirmBox(`An AI agent (via ${origin}) wants to: ${describe}`, controller.signal) && !controller.signal.aborted;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  return function confirmAiActionUseCase(origin: AiOrigin, describe: string): Promise<boolean> {
    const res = queue.then(() => ask(origin, describe));
    queue = res;
    return res;
  };
}

export type ConfirmAiActionUseCase = ReturnType<typeof createConfirmAiActionUseCase>;
