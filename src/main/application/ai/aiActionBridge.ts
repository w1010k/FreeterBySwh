/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcRequest, AiRpcResult } from '@common/ai/protocol';

type Deps = {
  /** Pushes the request to the app page (IPC has no main → renderer invoke). */
  send: (reqId: number, req: AiRpcRequest) => void;
  /** Must outlast the confirm dialog's own timeout. */
  timeoutMs: number;
}

export interface AiActionBridge {
  /** `signal`: the caller went away (its connection closed). */
  request(req: AiRpcRequest, signal?: AbortSignal): Promise<AiRpcResult>;
  resolve(reqId: number, res: AiRpcResult): void;
  /** Aborted when the request ends without an answer: its confirm box must close and not run anything. */
  signalFor(reqId: number): AbortSignal | undefined;
}

export function createAiActionBridge({ send, timeoutMs }: Deps): AiActionBridge {
  let nextId = 1;
  const pending = new Map<number, { resolve: (res: AiRpcResult) => void; ended: AbortController }>();

  return {
    request(req, signal) {
      const reqId = nextId++;
      return new Promise<AiRpcResult>(resolve => {
        const ended = new AbortController();
        const cleanups: (() => void)[] = [];
        const settle = (res: AiRpcResult) => {
          cleanups.forEach(c => c());
          pending.delete(reqId);
          resolve(res);
        };
        const giveUp = (res: AiRpcResult) => {
          ended.abort();
          settle(res);
        };
        const timer = setTimeout(() => giveUp({ ok: false, code: 'timeout', message: 'Freeter did not answer in time' }), timeoutMs);
        cleanups.push(() => clearTimeout(timer));
        pending.set(reqId, { resolve: settle, ended });
        if (signal) {
          const onCallerGone = () => giveUp({ ok: false, code: 'failed', message: 'The request was cancelled' });
          if (signal.aborted) {
            onCallerGone();
            return;
          }
          signal.addEventListener('abort', onCallerGone);
          cleanups.push(() => signal.removeEventListener('abort', onCallerGone));
        }
        send(reqId, req);
      });
    },
    resolve(reqId, res) {
      // A late answer (after a timeout, a cancel or a page reload) has no waiter and is dropped.
      pending.get(reqId)?.resolve(res);
    },
    signalFor(reqId) {
      return pending.get(reqId)?.ended.signal;
    }
  };
}
