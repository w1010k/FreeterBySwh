/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PassThrough } from 'node:stream';
import { AiClient, CliIo } from '@/cli/cli';
import { runMcpServer } from '@/cli/mcp';
import { AiRpcResult } from '@common/ai/protocol';

const list: AiRpcResult = {
  ok: true,
  value: [{ id: 'workflow.create', description: 'Create', kind: 'write', inputSchema: { type: 'object' } }]
};

async function exchange(lines: object[], runResult: AiRpcResult = { ok: true, value: { workflowId: 'w' } }, listResult: AiRpcResult = list) {
  const stdin = new PassThrough();
  const out: string[] = [];
  const io: CliIo = { stdin, stdout: { write: s => out.push(s) }, stderr: { write: () => undefined }, env: {} };
  const client: AiClient = {
    call: jest.fn(async (method: 'actions.list' | 'actions.run') => (method === 'actions.list' ? listResult : runResult)),
    close: jest.fn(),
    isClosed: () => false,
  };
  const done = runMcpServer(io, client, '1.2.3');
  stdin.end(lines.map(l => JSON.stringify(l) + '\n').join(''));
  await done;
  return { client, responses: out.join('').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) };
}

describe('runMcpServer', () => {
  it('initialize echoes protocolVersion', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }]);
    expect(responses[0]).toEqual({
      jsonrpc: '2.0', id: 1,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'acedeck', version: '1.2.3' } }
    });
  });

  it('tools/list maps "workflow.create" to "workflow_create"', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    expect(responses[0].result.tools).toEqual([{ name: 'workflow_create', description: 'Create', inputSchema: { type: 'object' } }]);
  });

  it('tools/list answers an error when Acedeck cannot be reached, instead of an empty list', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }], undefined, { ok: false, code: 'failed', message: 'Acedeck is not running' });
    expect(responses[0]).toMatchObject({ id: 2, error: { message: 'Acedeck is not running' } });
  });

  it('tools/call runs the action and returns its value as text', async () => {
    const { responses, client } = await exchange([{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workflow_create', arguments: { projectId: 'p' } } }]);
    expect(client.call).toHaveBeenCalledWith('actions.run', { actionId: 'workflow.create', input: { projectId: 'p' } });
    expect(responses[0].result).toEqual({ content: [{ type: 'text', text: '{"workflowId":"w"}' }] });
  });

  it('tools/call returns isError for a failed action', async () => {
    const { responses } = await exchange(
      [{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'workflow_create', arguments: {} } }],
      { ok: false, code: 'denied', message: 'no' }
    );
    expect(responses[0].result).toEqual({ content: [{ type: 'text', text: 'denied: no' }], isError: true });
  });

  it('tools/call returns isError for an unknown tool', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } }]);
    expect(responses[0].result.isError).toBe(true);
  });

  it('does not answer notifications', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', method: 'notifications/initialized' }]);
    expect(responses).toEqual([]);
  });

  it('answers -32601 for server/discover', async () => {
    const { responses } = await exchange([{ jsonrpc: '2.0', id: 6, method: 'server/discover' }]);
    expect(responses[0]).toMatchObject({ id: 6, error: { code: -32601 } });
  });
});
