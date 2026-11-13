/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcRequest, AiRpcResult } from '@common/ai/protocol';

type Deps = {
  /** Pushes the request to the app page (IPC has no main → renderer invoke). False: there is no app page to send to. */
  send: (reqId: number, req: AiRpcRequest) => boolean;
  /** Must outlast the confirm dialog's own timeout. */
  timeoutMs: number;
}

export interface AiActionBridge {
  /** `signal`: the caller went away (its connection closed). */
  request(req: AiRpcRequest, signal?: AbortSignal): Promise<AiRpcResult>;
  resolve(reqId: number, res: AiRpcResult): void;
  /** Aborted when the request ends without an answer: its confirm box must close and not run anything. */
  signalFor(reqId: number): AbortSignal | undefined;
  /** The app page listens for requests (it says so after loading; `closeAiWhenAppPageGoes` clears it). */
  setReady(ready: boolean): void;
}

const notReady: AiRpcResult = {
  ok: false,
  code: 'not_ready',
  message: 'Freeter is starting or reloading; retry in a moment. If this keeps happening, reload or restart Freeter'
};

/**
 * Closes AI control when the app page that said ai-ready is gone: a new document committed in the main frame
 * (`did-navigate`), or a crashed page process. The page says ai-ready only once, after loading.
 * Not `did-start-loading`: it also fired with the page still there, which left AI control closed from startup (swh.28).
 * Not a navigation start: will-navigate blocks some navigations, and the page stays.
 */
export function closeAiWhenAppPageGoes(appWebContents: { on(event: 'did-navigate' | 'render-process-gone', listener: () => void): unknown }, bridge: Pick<AiActionBridge, 'setReady'>): void {
  appWebContents.on('did-navigate', () => bridge.setReady(false));
  appWebContents.on('render-process-gone', () => bridge.setReady(false));
}

export function createAiActionBridge({ send, timeoutMs }: Deps): AiActionBridge {
  let nextId = 1;
  let ready = false;
  const pending = new Map<number, { resolve: (res: AiRpcResult) => void; ended: AbortController }>();

  return {
    request(req, signal) {
      if (!ready) {
        // Nothing would answer: say so now instead of after the timeout.
        return Promise.resolve(notReady);
      }
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
        if (!send(reqId, req)) {
          giveUp(notReady);
        }
      });
    },
    resolve(reqId, res) {
      // A late answer (after a timeout, a cancel or a page reload) has no waiter and is dropped.
      pending.get(reqId)?.resolve(res);
    },
    signalFor(reqId) {
      return pending.get(reqId)?.ended.signal;
    },
    setReady(value) {
      ready = value;
      if (!value) {
        // The page that would answer is gone: end its requests now (and close their confirm boxes) instead of
        // letting the callers wait out the timeout. Not not_ready: a confirmed action may have run, with only its answer lost.
        [...pending.values()].forEach(p => {
          p.ended.abort();
          p.resolve({ ok: false, code: 'failed', message: 'Freeter reloaded before answering; the action may have run. Check before retrying' });
        });
      }
    }
  };
}
