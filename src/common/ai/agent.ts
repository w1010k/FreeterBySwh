/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/** The agent CLIs Freeter can run itself (the control channel serves any agent). */
export type AgentTool = 'claude' | 'codex';
export const agentTools: readonly AgentTool[] = ['claude', 'codex'];

export type AgentEffort = 'low' | 'medium' | 'high';

export interface AgentSendRequest {
  tool: AgentTool;
  prompt: string;
  /** Model name as the CLI takes it (e.g. 'haiku', 'sonnet'); empty = the CLI's default. */
  model?: string;
  effort?: AgentEffort;
}

/** What a conversation turn reports, the same for every CLI. */
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; phase: 'start' | 'end'; ok?: boolean }
  | { type: 'done'; sessionId?: string; costUsd?: number }
  | { type: 'error'; message: string };
