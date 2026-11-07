/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * The `freeter` CLI: lets AI agents (and people) drive a running Freeter through
 * its AI control pipe. Runs on plain Node or on the Freeter executable with
 * ELECTRON_RUN_AS_NODE=1, so it must not import 'electron'.
 */

import { connect as netConnect } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AiActionInfo, aiOrigins, AiOrigin, AiRpcMethod, AiRpcResponse, AiRpcResult, createLineSplitter, encodeLine } from '@common/ai/protocol';
import { runMcpServer } from '@/cli/mcp';

export interface CliIo {
  stdin: NodeJS.ReadableStream;
  stdout: { write(s: string): void };
  stderr: { write(s: string): void };
  env: Record<string, string | undefined>;
}

export interface AiClient {
  call(method: AiRpcMethod, params: { actionId?: string; input?: unknown }): Promise<AiRpcResult>;
  close(): void;
  /** True once Freeter closed the connection (it quit or restarted). */
  isClosed(): boolean;
}

export type ConnectAiClient = (endpointPath: string, origin: AiOrigin) => Promise<AiClient>;

const notRunning = () => new Error('Freeter is not running');

export function defaultEndpointPath(env: Record<string, string | undefined>, platform: NodeJS.Platform, homeDir: string): string {
  if (env.FREETER_AI_ENDPOINT) {
    return env.FREETER_AI_ENDPOINT;
  }
  const base = platform === 'win32'
    ? env.APPDATA ?? join(homeDir, 'AppData', 'Roaming')
    : env.XDG_CONFIG_HOME ?? join(homeDir, '.config');
  return join(base, 'freeter-swh', 'freeter-data', 'ai', 'endpoint.json');
}

export async function connectAiClient(endpointPath: string, origin: AiOrigin): Promise<AiClient> {
  let endpoint: { pipe?: unknown; token?: unknown };
  try {
    endpoint = JSON.parse(await readFile(endpointPath, 'utf8'));
  } catch {
    throw notRunning();
  }
  const { pipe, token } = endpoint;
  if (typeof pipe !== 'string' || typeof token !== 'string') {
    throw notRunning();
  }
  // A crash leaves endpoint.json behind; the dead pipe then refuses the connection.
  const socket = await new Promise<ReturnType<typeof netConnect>>((resolve, reject) => {
    const onError = () => reject(notRunning());
    const s = netConnect(pipe, () => {
      s.off('error', onError);
      resolve(s);
    });
    s.once('error', onError);
  });

  let nextId = 1;
  const pending = new Map<number, (res: AiRpcResult) => void>();
  const failAll = (message: string) => {
    pending.forEach(resolve => resolve({ ok: false, code: 'failed', message }));
    pending.clear();
  };
  socket.on('data', createLineSplitter(line => {
    let msg: AiRpcResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.id !== 'number') {
      return;
    }
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve?.(msg.error ? { ok: false, code: msg.error.data?.code ?? 'failed', message: msg.error.message } : { ok: true, value: msg.result ?? null });
  }, () => socket.destroy()));
  socket.on('error', () => failAll('Connection to Freeter failed'));
  socket.on('close', () => failAll('Freeter closed the connection'));

  return {
    call(method, params) {
      if (socket.destroyed) {
        // A write to a destroyed socket raises no 'error' event, so the call would never settle.
        return Promise.resolve({ ok: false, code: 'failed', message: 'Freeter closed the connection' });
      }
      const id = nextId++;
      return new Promise<AiRpcResult>(resolve => {
        pending.set(id, resolve);
        socket.write(encodeLine({ jsonrpc: '2.0', id, method, params: { ...params, token, origin } }));
      });
    },
    close: () => socket.end(),
    isClosed: () => socket.destroyed
  };
}

/**
 * For the long-lived `freeter mcp`: when Freeter restarts (new pipe, new token),
 * the next call reads endpoint.json again and reconnects.
 */
export function createReconnectingAiClient(first: AiClient, reopen: () => Promise<AiClient>): AiClient {
  let current = first;
  return {
    async call(method, params) {
      if (current.isClosed()) {
        try {
          current = await reopen();
        } catch (err) {
          return { ok: false, code: 'failed', message: err instanceof Error ? err.message : String(err) };
        }
      }
      return current.call(method, params);
    },
    close: () => current.close(),
    isClosed: () => current.isClosed()
  };
}

const usage = `Usage:
  freeter actions [--json]              List what an agent can do in Freeter
  freeter run <action> [--input <JSON>] Run an action (write actions ask the user first)
  freeter guide                         Print a usage guide for AI agents
  freeter mcp                           Run as a stdio MCP server
`;

function guideText(actions: AiActionInfo[]): string {
  return `# Freeter CLI guide for AI agents

Freeter is a desktop organizer: projects contain workflows, workflows contain widgets.
This CLI drives the running Freeter app.

## Commands

| Command | Does |
|---------|------|
| \`freeter actions --json\` | List actions with their input JSON Schema |
| \`freeter run <action> --input '<JSON>'\` | Run an action; prints the result as JSON |
| \`freeter mcp\` | Same actions as MCP tools over stdio (\`.\` in ids becomes \`_\`) |

Start with \`freeter run app.describe\` to get the ids of projects, workflows, widgets and widget types.

## Confirmation

Every "write" action shows the user an Allow/Deny dialog in Freeter. A denial or no answer
within 2 minutes fails with "denied". Tell the user; do not retry without asking.

## Exit codes

0 success, 1 action failed (stderr: "<code>: <message>"), 2 usage error, 3 Freeter not running.

## Actions

${actions.map(a => `- \`${a.id}\` (${a.kind}): ${a.description}\n  input: \`${JSON.stringify(a.inputSchema)}\``).join('\n')}
`;
}

/** Returns the process exit code. */
export async function runCli(argv: string[], io: CliIo, connect: ConnectAiClient, version = 'dev'): Promise<number> {
  const [command, ...rest] = argv;
  const fail = (code: number, message: string) => {
    io.stderr.write(message.endsWith('\n') ? message : message + '\n');
    return code;
  };

  let request: { method: AiRpcMethod; params: { actionId?: string; input?: unknown } } | undefined;
  if (command === 'actions' || command === 'guide') {
    request = { method: 'actions.list', params: {} };
  } else if (command === 'run' && rest[0] && !rest[0].startsWith('-')) {
    let input: unknown = {};
    if (rest[1] === '--input') {
      try {
        input = JSON.parse(rest[2] ?? '');
      } catch {
        return fail(2, `--input is not valid JSON\n${usage}`);
      }
    } else if (rest.length > 1) {
      return fail(2, usage);
    }
    request = { method: 'actions.run', params: { actionId: rest[0], input } };
  } else if (command !== 'mcp') {
    return fail(2, usage);
  }

  const envOrigin = aiOrigins.find(o => o === io.env.FREETER_AI_ORIGIN);
  // Freeter's agent runner starts `freeter mcp` with FREETER_AI_ORIGIN=agent-runner.
  const origin: AiOrigin = envOrigin ?? (command === 'mcp' ? 'mcp' : 'cli');
  const endpointPath = defaultEndpointPath(io.env, process.platform, io.env.USERPROFILE ?? io.env.HOME ?? '');
  let client: AiClient;
  try {
    client = await connect(endpointPath, origin);
  } catch (err) {
    return fail(3, err instanceof Error ? err.message : String(err));
  }

  try {
    if (!request) {
      await runMcpServer(io, createReconnectingAiClient(client, () => connect(endpointPath, origin)), version);
      return 0;
    }
    const res = await client.call(request.method, request.params);
    if (!res.ok) {
      return fail(1, `${res.code}: ${res.message}`);
    }
    if (command === 'guide') {
      io.stdout.write(guideText(res.value as AiActionInfo[]));
    } else if (command === 'actions' && rest[0] !== '--json') {
      io.stdout.write((res.value as AiActionInfo[]).map(a => `${a.id}\t${a.kind}\t${a.description}`).join('\n') + '\n');
    } else {
      io.stdout.write(JSON.stringify(res.value, null, 2) + '\n');
    }
    return 0;
  } finally {
    client.close();
  }
}
