/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** The agent CLIs Freeter can run itself (the control channel serves any agent). */
export type AgentTool = 'claude' | 'codex';
export const agentTools: readonly AgentTool[] = ['claude', 'codex'];

export type AgentEffort = 'low' | 'medium' | 'high';
export const agentEfforts: readonly AgentEffort[] = ['low', 'medium', 'high'];

/**
 * Claude session ids and Codex thread ids are UUIDs. A resume id goes on a command line after --resume, whose
 * value is optional: an id starting with '-' would be read as another option.
 */
export const isSafeAgentId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(id);

export interface AgentSendRequest {
  tool: AgentTool;
  prompt: string;
  /** Model name as the CLI takes it (e.g. 'haiku', 'sonnet'); empty = the CLI's default. */
  model?: string;
  effort?: AgentEffort;
  /** For a new conversation: the CLI conversation to continue (Claude session id / Codex thread id), e.g. after an app restart. */
  resume?: string;
}

/** What a conversation turn reports, the same for every CLI. */
export type AgentEvent =
  /** A new paragraph of the answer (Claude Code streams it: it starts empty and grows by textDelta). */
  | { type: 'text'; text: string }
  /** More of the current paragraph. */
  | { type: 'textDelta'; text: string }
  | { type: 'tool'; name: string; phase: 'start' | 'end'; ok?: boolean }
  | { type: 'done'; sessionId?: string; costUsd?: number }
  /** sessionId: the conversation to continue later. */
  | { type: 'error'; message: string; sessionId?: string }
  /** The CLI conversation id is known (early in a turn): the page saves it before the turn ends. */
  | { type: 'session'; sessionId: string }
  /** Information that does not end the turn (e.g. the conversation to continue was gone, a new one started). */
  | { type: 'notice'; message: string; sessionLost?: true };
