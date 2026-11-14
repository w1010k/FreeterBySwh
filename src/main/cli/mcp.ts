/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import type { AiClient, CliIo } from '@/cli/cli';
import { AiActionInfo, createLineSplitter, encodeLine } from '@common/ai/protocol';

/**
 * `acedeck mcp`: a stdio MCP server whose tools are the app's AI actions.
 * ponytail: hand-written JSON-RPC (initialize, tools/list, tools/call) instead of
 * @modelcontextprotocol/sdk; switch to the SDK if protocol versions start to matter.
 */
export function runMcpServer(io: CliIo, client: AiClient, version: string): Promise<void> {
  // Tool names cannot contain '.', so 'workflow.create' is exposed as 'workflow_create'.
  let toolIds = new Map<string, string>();
  const toToolName = (id: string) => id.replace(/\./g, '_');

  const reply = (id: unknown, body: { result: unknown } | { error: { code: number; message: string } }) =>
    io.stdout.write(encodeLine({ jsonrpc: '2.0', id, ...body }));

  const loadTools = async (): Promise<AiActionInfo[] | string> => {
    const res = await client.call('actions.list', {});
    if (!res.ok) {
      return res.message;
    }
    const actions = res.value as AiActionInfo[];
    toolIds = new Map(actions.map(a => [toToolName(a.id), a.id]));
    return actions;
  };

  const handle = async (msg: { id?: unknown; method?: unknown; params?: Record<string, unknown> }) => {
    const { id, method, params } = msg;
    if (id === undefined || id === null) {
      return; // notification
    }
    switch (method) {
      case 'initialize':
        reply(id, {
          result: {
            protocolVersion: params?.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'acedeck', version }
          }
        });
        return;
      case 'ping':
        reply(id, { result: {} });
        return;
      case 'tools/list': {
        const actions = await loadTools();
        if (typeof actions === 'string') {
          // An empty list would hide why there are no tools (e.g. Freeter is not running).
          reply(id, { error: { code: -32000, message: actions } });
          return;
        }
        reply(id, { result: { tools: actions.map(a => ({ name: toToolName(a.id), description: a.description, inputSchema: a.inputSchema })) } });
        return;
      }
      case 'tools/call': {
        const name = typeof params?.name === 'string' ? params.name : '';
        if (!toolIds.has(name)) {
          await loadTools();
        }
        const actionId = toolIds.get(name);
        if (!actionId) {
          reply(id, { result: { content: [{ type: 'text', text: `unknown_action: ${name}` }], isError: true } });
          return;
        }
        const res = await client.call('actions.run', { actionId, input: params?.arguments ?? {} });
        reply(id, {
          result: res.ok
            ? { content: [{ type: 'text', text: JSON.stringify(res.value) }] }
            : { content: [{ type: 'text', text: `${res.code}: ${res.message}` }], isError: true }
        });
        return;
      }
      default:
        reply(id, { error: { code: -32601, message: `Method not found: ${String(method)}` } });
    }
  };

  return new Promise(resolve => {
    const inFlight = new Set<Promise<void>>();
    io.stdin.on('data', createLineSplitter(line => {
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        reply(null, { error: { code: -32700, message: 'Parse error' } });
        return;
      }
      if (typeof msg !== 'object' || msg === null) {
        return;
      }
      const p = handle(msg as Parameters<typeof handle>[0]).catch(() => undefined);
      inFlight.add(p);
      p.finally(() => inFlight.delete(p));
    }, () => {
      // An over-long line: stop reading and end the server.
      io.stdin.pause();
      resolve();
    }));
    io.stdin.on('end', () => {
      Promise.all(inFlight).then(() => resolve());
    });
  });
}
