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
  /** 'write' actions run only after the user allows them (or turned on "always allow"). */
  kind: 'read' | 'write';
  /**
   * True when this write can run programs or commands on the PC (now or when the user clicks later), send data off
   * the PC, or change where files land: it asks even with "always allow" on, since text the agent read (a note)
   * could have steered it.
   */
  alwaysConfirm?(input: I): boolean;
  /** JSON Schema shown to agents; `parse` is what actually validates. */
  inputSchema: object;
  /** Type guard for the untrusted input; undefined rejects it. */
  parse(input: unknown): I | undefined;
  /** English one-liner for the confirm dialog. */
  describe(input: I): string;
  /**
   * Reads the current state itself: the state may have changed while the dialog was open.
   * `confirmed`: the user allowed this write in the confirm box (not "always allow").
   */
  run(input: I, how?: { confirmed: boolean }): Promise<AiRpcResult> | AiRpcResult;
}
