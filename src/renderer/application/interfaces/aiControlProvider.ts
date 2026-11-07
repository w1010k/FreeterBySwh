/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiOrigin, AiRpcResult } from '@common/ai/protocol';

export interface AiControlProvider {
  confirm(origin: AiOrigin, describe: string): Promise<boolean>;
  respond(reqId: number, res: AiRpcResult): Promise<void>;
}
