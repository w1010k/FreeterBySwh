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
  request(req: AiRpcRequest): Promise<AiRpcResult>;
  resolve(reqId: number, res: AiRpcResult): void;
}

export function createAiActionBridge({ send, timeoutMs }: Deps): AiActionBridge {
  let nextId = 1;
  const pending = new Map<number, (res: AiRpcResult) => void>();

  return {
    request(req) {
      const reqId = nextId++;
      return new Promise<AiRpcResult>(resolve => {
        const timer = setTimeout(() => {
          pending.delete(reqId);
          resolve({ ok: false, code: 'timeout', message: 'Freeter did not answer in time' });
        }, timeoutMs);
        pending.set(reqId, res => {
          clearTimeout(timer);
          pending.delete(reqId);
          resolve(res);
        });
        send(reqId, req);
      });
    },
    resolve(reqId, res) {
      // A late answer (after a timeout or a page reload) has no waiter and is dropped.
      pending.get(reqId)?.(res);
    }
  };
}
