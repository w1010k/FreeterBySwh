/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * The `acedeck` CLI (`freeter` is its former name, kept as an alias): lets AI agents (and people) drive a running app through
 * its AI control pipe. Runs on plain Node or on the Freeter executable with
 * ELECTRON_RUN_AS_NODE=1, so it must not import 'electron'.
 */

import { connect as netConnect } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AiActionInfo, aiOrigins, AiOrigin, AiRpcMethod, AiRpcResponse, AiRpcResult, createLineSplitter, encodeLine } from '@common/ai/protocol';
import { runMcpServer } from '@/cli/mcp';
import { userDataDirName } from '@/base/userDataDir';

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

const notRunning = () => new Error('Acedeck is not running');
const CLOSED = 'Acedeck closed the connection';

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function defaultEndpointPath(env: Record<string, string | undefined>, platform: NodeJS.Platform, homeDir: string): string {
  if (env.FREETER_AI_ENDPOINT) {
    return env.FREETER_AI_ENDPOINT;
  }
  const base = platform === 'win32'
    ? env.APPDATA ?? join(homeDir, 'AppData', 'Roaming')
    : env.XDG_CONFIG_HOME ?? join(homeDir, '.config');
  return join(base, userDataDirName(true), 'freeter-data', 'ai', 'endpoint.json');
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
  socket.on('error', () => failAll('Connection to Acedeck failed'));
  socket.on('close', () => failAll(CLOSED));

  return {
    call(method, params) {
      if (socket.destroyed) {
        // A write to a destroyed socket raises no 'error' event, so the call would never settle.
        return Promise.resolve({ ok: false, code: 'failed', message: CLOSED });
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

/** Stands in until the first connection: every call reconnects. */
const closedClient: AiClient = {
  call: async () => ({ ok: false, code: 'failed', message: 'Acedeck is not running' }),
  close: () => undefined,
  isClosed: () => true,
};

/**
 * For the long-lived `acedeck mcp`: when Freeter restarts (new pipe, new token),
 * the next call reads endpoint.json again and reconnects.
 */
export function createReconnectingAiClient(first: AiClient, reopen: () => Promise<AiClient>): AiClient {
  let current = first;
  /**
   * The connection Freeter refused for its old token. Calls on it never ran (Freeter checks the token first),
   * so a call that saw it close may be sent again. A connection that closed for another reason gets no retry.
   */
  let refused: AiClient | undefined;
  let closing = false;
  // Calls that find the connection closed at the same time share one reconnect.
  let reopening: Promise<AiClient> | undefined;
  const reconnect = async (): Promise<string | undefined> => {
    try {
      reopening ??= reopen().finally(() => {
        reopening = undefined;
      });
      current = await reopening;
      if (closing) {
        current.close(); // closed meanwhile: a socket left open would keep `acedeck mcp` running
      }
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };
  return {
    async call(method, params) {
      if (current.isClosed()) {
        const failed = await reconnect();
        if (failed) {
          return { ok: false, code: 'failed', message: failed };
        }
      }
      const used = current;
      const res = await used.call(method, params);
      // A call on a connection another refused call replaced also failed for the old token (Freeter refuses before
      // it runs anything), even when it saw only the connection close: it retries too.
      if (res.ok) {
        return res;
      }
      // CLOSED is also what failAll writes, so rewording it changes both sides.
      const replaced = used === refused && res.message === CLOSED;
      if (res.code !== 'unauthorized' && !replaced) {
        return res;
      }
      // A refused token means endpoint.json was older than the running Freeter (it was restarting):
      // read it again once. Another call may have done it already; then only retry.
      if (current === used) {
        // Calls that come in meanwhile see a closed client and wait for the same reconnect.
        current = closedClient;
        refused = used;
        used.close();
      }
      // Another call may be reconnecting already: reconnect() then waits for that one.
      if (current.isClosed()) {
        const failed = await reconnect();
        if (failed) {
          return { ok: false, code: 'failed', message: failed };
        }
      }
      return current.call(method, params);
    },
    close: () => {
      closing = true;
      current.close();
    },
    isClosed: () => current.isClosed()
  };
}

const usage = `Usage:
  acedeck actions [--json]              List what an agent can do in Acedeck
  acedeck run <action> [--input <JSON> | --input - | --input-file <path>]
                                        Run an action (write actions ask the user first,
                                        unless the user turned on "always allow");
                                        '-' reads the JSON from stdin
  acedeck guide                         Print a usage guide for AI agents
  acedeck mcp                           Run as a stdio MCP server
`;

export function guideText(actions: AiActionInfo[]): string {
  return `# Acedeck CLI guide for AI agents

Acedeck is a desktop organizer: projects contain workflows, workflows contain widgets.
This CLI drives the running Acedeck app.

## Commands

| Command | Does |
|---------|------|
| \`acedeck actions --json\` | List actions with their input JSON Schema |
| \`acedeck run <action> --input-file <path>\` | Run an action with the JSON input in a UTF-8 file; prints the result as JSON |
| \`acedeck run <action> --input -\` | Same, reading the JSON from stdin |
| \`acedeck run <action> --input '<JSON>'\` | Same, JSON as an argument (POSIX shells only: PowerShell and cmd.exe drop its quotes) |
| \`acedeck mcp\` | Same actions as MCP tools over stdio (\`.\` in ids becomes \`_\`) |

Start with \`acedeck run app.describe\` to get the ids of projects, workflows, widgets and widget types.

## Confirmation

A "write" action shows the user an Allow/Deny dialog in Acedeck. A denial or no answer
within 2 minutes fails with "denied". Tell the user; do not retry without asking.
If the user turned on "AI actions: always allow", most writes (deletes too) run at once with no
dialog; only actions that can run programs or send data off the PC still ask. So make only the
changes the user asked for, and ask in the chat before deleting anything.

## Exit codes

0 success, 1 action failed (stderr: "<code>: <message>"), 2 usage error, 3 Acedeck not running.

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
    if (rest[1] === '--input' || rest[1] === '--input-file') {
      let text: string;
      try {
        // '-' and --input-file exist because shells such as PowerShell strip the quotes of a JSON argument.
        text = rest[1] === '--input-file' ? await readFile(rest[2] ?? '', 'utf8') : rest[2] === '-' ? await readAll(io.stdin) : rest[2] ?? '';
      } catch {
        return fail(2, `Cannot read ${rest[2]}\n${usage}`);
      }
      try {
        input = JSON.parse(text.replace(/^\uFEFF/, ''));
      } catch {
        return fail(2, `The input is not valid JSON\n${usage}`);
      }
    } else if (rest.length > 1) {
      return fail(2, usage);
    }
    request = { method: 'actions.run', params: { actionId: rest[0], input } };
  } else if (command !== 'mcp') {
    return fail(2, usage);
  }

  const envOrigin = aiOrigins.find(o => o === io.env.FREETER_AI_ORIGIN);
  // The in-app terminal sets FREETER_AI_ORIGIN=terminal for the agents started in it.
  const origin: AiOrigin = envOrigin ?? (command === 'mcp' ? 'mcp' : 'cli');
  const endpointPath = defaultEndpointPath(io.env, process.platform, io.env.USERPROFILE ?? io.env.HOME ?? '');
  if (!request) {
    // An MCP host may start before Freeter (e.g. at login): connect on the first call, and again after a restart.
    const client = createReconnectingAiClient(closedClient, () => connect(endpointPath, origin));
    try {
      await runMcpServer(io, client, version);
    } finally {
      client.close();
    }
    return 0;
  }
  let client: AiClient;
  try {
    client = createReconnectingAiClient(await connect(endpointPath, origin), () => connect(endpointPath, origin));
  } catch (err) {
    return fail(3, err instanceof Error ? err.message : String(err));
  }

  try {
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
