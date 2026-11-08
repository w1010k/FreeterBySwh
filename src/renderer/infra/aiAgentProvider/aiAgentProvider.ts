/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiAgentProvider } from '@/application/interfaces/aiAgentProvider';
import { electronIpcRenderer } from '@/infra/mainApi/mainApi';
import { createSubscribers } from '@/infra/subscribers/subscribers';
import { AgentEvent } from '@common/ai/agent';
import {
  IpcAiAgentCancelArgs, IpcAiAgentCancelRes, IpcAiAgentDetectArgs, IpcAiAgentDetectRes, IpcAiAgentEndArgs, IpcAiAgentEndRes,
  IpcAiAgentSendArgs, IpcAiAgentSendRes, IpcAiAgentWarmArgs, IpcAiAgentWarmRes,
  ipcAiAgentCancelChannel, ipcAiAgentDetectChannel, ipcAiAgentEndChannel, ipcAiAgentEventChannel, ipcAiAgentSendChannel, ipcAiAgentWarmChannel
} from '@common/ipc/channels';

/** One IPC listener for the app's lifetime; it hands events to each conversation's subscribers. */
export function createAiAgentProvider(): AiAgentProvider {
  const subs = createSubscribers<AgentEvent>();
  /**
   * Events of a conversation nobody listens to yet: the page learns a new conversation's id from the send answer,
   * and main can send events before that answer arrives (a spawn failure); kept here for it. A few, for a few ids.
   */
  const early = new Map<string, AgentEvent[]>();
  electronIpcRenderer.on(ipcAiAgentEventChannel, (id, event) => {
    if (typeof id !== 'string' || typeof event !== 'object' || event === null) {
      return;
    }
    if (subs.has(id)) {
      subs.emit(id, event as AgentEvent);
      return;
    }
    const kept = early.get(id) ?? [];
    early.delete(id); // re-added last: the oldest id is dropped first
    kept.push(event as AgentEvent);
    if (kept.length > 50) {
      kept.shift();
    }
    early.set(id, kept);
    if (early.size > 20) {
      early.delete(early.keys().next().value as string);
    }
  });
  return {
    detect: () => electronIpcRenderer.invoke<IpcAiAgentDetectArgs, IpcAiAgentDetectRes>(ipcAiAgentDetectChannel),
    send: (conversationId, req) => electronIpcRenderer.invoke<IpcAiAgentSendArgs, IpcAiAgentSendRes>(ipcAiAgentSendChannel, conversationId, req),
    cancel: (conversationId) => {
      // Nothing to wait for; a failed call (e.g. the window is closing) must not surface as an unhandled rejection.
      electronIpcRenderer.invoke<IpcAiAgentCancelArgs, IpcAiAgentCancelRes>(ipcAiAgentCancelChannel, conversationId).catch(() => undefined);
    },
    warm: (conversationId, o) => electronIpcRenderer.invoke<IpcAiAgentWarmArgs, IpcAiAgentWarmRes>(ipcAiAgentWarmChannel, conversationId, o),
    end: (conversationId) => {
      electronIpcRenderer.invoke<IpcAiAgentEndArgs, IpcAiAgentEndRes>(ipcAiAgentEndChannel, conversationId).catch(() => undefined);
    },
    onEvent: (conversationId, fn) => {
      const off = subs.add(conversationId, fn);
      const kept = early.get(conversationId);
      early.delete(conversationId);
      kept?.forEach(e => fn(e));
      return off;
    },
  };
}
