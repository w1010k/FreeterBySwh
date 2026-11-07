/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createServer, Server, Socket } from 'node:net';
import { chmod, rm } from 'node:fs/promises';
import { aiOrigins, AiRpcRequest, AiRpcResult, createLineSplitter, encodeLine, toRpcResponse } from '@common/ai/protocol';

type Deps = {
  /** Named pipe (`\\.\pipe\...`) on Windows, socket file elsewhere. */
  path: string;
  /** Changes on every app run; every request must carry it. */
  token: string;
  handle: (req: AiRpcRequest) => Promise<AiRpcResult>;
}

export interface AiControlServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses one line; returns the request, or the failure to answer with. */
function parseRequest(line: string, token: string): { req: AiRpcRequest } | { id: number | null; res: AiRpcResult } {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return { id: null, res: { ok: false, code: 'parse_error', message: 'Invalid JSON' } };
  }
  if (!isRecord(msg) || typeof msg.id !== 'number' || typeof msg.method !== 'string' || !isRecord(msg.params)) {
    return { id: null, res: { ok: false, code: 'parse_error', message: 'Invalid request' } };
  }
  const { id, method, params } = msg;
  if (params.token !== token) {
    return { id, res: { ok: false, code: 'unauthorized', message: 'Invalid token' } };
  }
  if (method !== 'actions.list' && method !== 'actions.run') {
    return { id, res: { ok: false, code: 'unknown_method', message: `Unknown method: ${method}` } };
  }
  // ponytail: an unknown origin only changes the confirm dialog's wording, so it falls back to 'cli'.
  const origin = aiOrigins.find(o => o === params.origin) ?? 'cli';
  return {
    req: {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        token,
        origin,
        actionId: typeof params.actionId === 'string' ? params.actionId : undefined,
        input: params.input
      }
    }
  };
}

export function createAiControlServer({ path, token, handle }: Deps): AiControlServer {
  let server: Server | undefined;
  const sockets = new Set<Socket>();

  const onConnection = (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    const reply = (msg: object) => {
      if (!socket.destroyed) {
        socket.write(encodeLine(msg));
      }
    };
    socket.on('data', createLineSplitter(line => {
      const parsed = parseRequest(line, token);
      if (!('req' in parsed)) {
        reply(toRpcResponse(parsed.id, parsed.res));
        return;
      }
      const { req } = parsed;
      handle(req).then(
        res => reply(toRpcResponse(req.id, res)),
        (err: unknown) => reply(toRpcResponse(req.id, { ok: false, code: 'failed', message: err instanceof Error ? err.message : String(err) }))
      );
    }, () => socket.destroy()));
  };

  return {
    async start() {
      if (process.platform !== 'win32') {
        // A socket file left by a crashed run blocks listen().
        await rm(path, { force: true });
      }
      const srv = createServer(onConnection);
      await new Promise<void>((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(path, () => {
          srv.off('error', reject);
          resolve();
        });
      });
      server = srv;
      if (process.platform !== 'win32') {
        await chmod(path, 0o600);
      }
    },
    async stop() {
      const srv = server;
      server = undefined;
      sockets.forEach(s => s.destroy());
      if (srv) {
        await new Promise<void>(resolve => srv.close(() => resolve()));
      }
    }
  };
}
