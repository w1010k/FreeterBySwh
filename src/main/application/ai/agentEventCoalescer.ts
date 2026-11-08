/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AgentEvent } from '@common/ai/agent';

type Send = (conversationId: string, event: AgentEvent) => void;

/**
 * Streamed text goes to the page at most once per `windowMs` per conversation (like Paseo's agent stream
 * coalescer): each piece would otherwise be one IPC message and one render of the chat. The first piece after a
 * quiet window goes at once (no delay for the first words); any other event sends the held text first (order kept).
 */
export function createAgentEventCoalescer(send: Send, windowMs: number): Send {
  const held = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>();
  const lastSentAt = new Map<string, number>();

  const flush = (id: string) => {
    const h = held.get(id);
    if (h) {
      clearTimeout(h.timer);
      held.delete(id);
      lastSentAt.set(id, Date.now());
      send(id, { type: 'textDelta', text: h.text });
    }
  };

  return (id, event) => {
    if (event.type !== 'textDelta') {
      flush(id);
      lastSentAt.delete(id);
      send(id, event);
      return;
    }
    const h = held.get(id);
    if (h) {
      h.text += event.text;
      return;
    }
    const since = Date.now() - (lastSentAt.get(id) ?? -Infinity);
    if (since >= windowMs) {
      lastSentAt.set(id, Date.now());
      send(id, event);
      return;
    }
    const timer = setTimeout(() => flush(id), windowMs - since);
    timer.unref?.();
    held.set(id, { text: event.text, timer });
  };
}
