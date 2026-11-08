/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiOrigin, AiRpcResult } from '@common/ai/protocol';

export interface AiControlProvider {
  confirm(reqId: number, origin: AiOrigin, describe: string): Promise<boolean>;
  respond(reqId: number, res: AiRpcResult): Promise<void>;
  /** The request is still wanted (not cancelled, not timed out). */
  alive(reqId: number): Promise<boolean>;
  /** Tells main the page now listens for requests. */
  ready(): Promise<void>;
}
