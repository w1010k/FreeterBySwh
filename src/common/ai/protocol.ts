/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * The AI control protocol: newline-delimited JSON-RPC 2.0 between the `freeter` CLI
 * (or `freeter mcp`) and the running app's control server.
 */

export type AiOrigin = 'cli' | 'mcp' | 'terminal';
export const aiOrigins: readonly AiOrigin[] = ['cli', 'mcp', 'terminal'];

export type AiErrorCode =
  | 'parse_error'
  | 'unauthorized'
  | 'unknown_method'
  | 'unknown_action'
  | 'invalid_input'
  | 'denied'
  | 'timeout'
  | 'not_ready'
  | 'not_found'
  | 'failed';

export interface AiActionInfo {
  id: string;
  description: string;
  kind: 'read' | 'write';
  inputSchema: object;
}

export type AiRpcResult = { ok: true; value: unknown } | { ok: false; code: AiErrorCode; message: string };

export type AiRpcMethod = 'actions.list' | 'actions.run';

export interface AiRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: AiRpcMethod;
  params: { token: string; origin: AiOrigin; actionId?: string; input?: unknown };
}

export interface AiRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data: { code: AiErrorCode } };
}

/** A longer line drops the connection: it bounds what one peer can make us buffer. */
export const AI_MAX_LINE_BYTES = 1048576;

/**
 * Splits a byte stream into lines. Bytes are kept until a newline arrives, so a
 * multi-byte character split between chunks decodes correctly.
 */
export function createLineSplitter(onLine: (line: string) => void, onOverflow: () => void): (chunk: Buffer | string) => void {
  let pending = Buffer.alloc(0);
  let overflowed = false;
  return (chunk) => {
    if (overflowed) {
      return;
    }
    pending = Buffer.concat([pending, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
    let nl = pending.indexOf(10);
    while (nl >= 0) {
      const line = pending.subarray(0, nl).toString('utf8').replace(/\r$/, '');
      pending = pending.subarray(nl + 1);
      if (line.length > 0) {
        onLine(line);
      }
      nl = pending.indexOf(10);
    }
    if (pending.length > AI_MAX_LINE_BYTES) {
      overflowed = true;
      pending = Buffer.alloc(0);
      onOverflow();
    }
  };
}

export function encodeLine(msg: object): string {
  return JSON.stringify(msg) + '\n';
}

export function toRpcResponse(id: number | null, res: AiRpcResult): AiRpcResponse {
  if (res.ok) {
    return { jsonrpc: '2.0', id, result: res.value };
  }
  return { jsonrpc: '2.0', id, error: { code: -32000, message: res.message, data: { code: res.code } } };
}
