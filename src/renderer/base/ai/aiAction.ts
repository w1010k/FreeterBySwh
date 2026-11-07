/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult } from '@common/ai/protocol';

/** One thing an AI agent may do in Freeter (exposed through the `freeter` CLI and MCP). */
export interface AiAction<I = unknown> {
  /** Dot-separated, e.g. 'workflow.create'. */
  id: string;
  /** English, read by the agent. */
  description: string;
  /** 'write' actions run only after the user allows them. */
  kind: 'read' | 'write';
  /** JSON Schema shown to agents; `parse` is what actually validates. */
  inputSchema: object;
  /** Type guard for the untrusted input; undefined rejects it. */
  parse(input: unknown): I | undefined;
  /** English one-liner for the confirm dialog. */
  describe(input: I): string;
  /** Reads the current state itself: the state may have changed while the dialog was open. */
  run(input: I): Promise<AiRpcResult> | AiRpcResult;
}
