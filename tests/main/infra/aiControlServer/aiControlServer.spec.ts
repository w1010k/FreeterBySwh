/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { connect, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createAiControlServer } from '@/infra/aiControlServer/aiControlServer';
import { AI_MAX_LINE_BYTES, AiRpcRequest, AiRpcResponse, AiRpcResult, createLineSplitter, encodeLine } from '@common/ai/protocol';

const token = 'secret';

function testPath() {
  const id = randomBytes(6).toString('hex');
  return process.platform === 'win32' ? `\\\\.\\pipe\\freeter-test-${id}` : join(tmpdir(), `freeter-test-${id}.sock`);
}

async function setup(handle: (req: AiRpcRequest) => Promise<AiRpcResult> = async () => ({ ok: true, value: 42 })) {
  const path = testPath();
  const server = createAiControlServer({ path, token, handle });
  await server.start();
  const socket: Socket = await new Promise((resolve, reject) => {
    const s = connect(path, () => resolve(s));
    s.on('error', reject);
  });
  const responses: AiRpcResponse[] = [];
  const waiters: (() => void)[] = [];
  socket.on('data', createLineSplitter(line => {
    responses.push(JSON.parse(line));
    waiters.splice(0).forEach(w => w());
  }, () => undefined));
  const next = async (count: number) => {
    while (responses.length < count) {
      await new Promise<void>(r => waiters.push(r));
    }
    return responses.slice(0, count);
  };
  const closed = new Promise<void>(r => socket.on('close', () => r()));
  return { server, socket, next, closed };
}

const req = (id: number, overrides: Partial<AiRpcRequest['params']> = {}, method = 'actions.list') =>
  ({ jsonrpc: '2.0', id, method, params: { token, origin: 'cli', ...overrides } });

describe('createAiControlServer', () => {
  it('rejects a request with a wrong token as unauthorized and keeps the connection', async () => {
    const { server, socket, next } = await setup();
    socket.write(encodeLine(req(1, { token: 'wrong' })));
    socket.write(encodeLine(req(2)));
    const [r1, r2] = await next(2);
    expect(r1.error?.data.code).toBe('unauthorized');
    expect(r2.result).toBe(42);
    socket.destroy();
    await server.stop();
  });

  it('answers parse_error with id null for a non-JSON line', async () => {
    const { server, socket, next } = await setup();
    socket.write('nope\n');
    const [r] = await next(1);
    expect(r.id).toBeNull();
    expect(r.error?.data.code).toBe('parse_error');
    socket.destroy();
    await server.stop();
  });

  it('answers unknown_method for method "x"', async () => {
    const { server, socket, next } = await setup();
    socket.write(encodeLine(req(5, {}, 'x')));
    const [r] = await next(1);
    expect(r).toMatchObject({ id: 5, error: { data: { code: 'unknown_method' } } });
    socket.destroy();
    await server.stop();
  });

  it('passes a valid request to handle and writes its result', async () => {
    const handle = jest.fn(async () => ({ ok: true, value: 42 }) as AiRpcResult);
    const { server, socket, next } = await setup(handle);
    socket.write(encodeLine(req(7, { actionId: 'a.b', input: { x: 1 } }, 'actions.run')));
    const [r] = await next(1);
    expect(r).toEqual({ jsonrpc: '2.0', id: 7, result: 42 });
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ method: 'actions.run', params: expect.objectContaining({ actionId: 'a.b', input: { x: 1 } }) }));
    socket.destroy();
    await server.stop();
  });

  it('answers failed when handle throws', async () => {
    const { server, socket, next } = await setup(async () => {
      throw new Error('boom');
    });
    socket.write(encodeLine(req(1)));
    const [r] = await next(1);
    expect(r.error).toMatchObject({ message: 'boom', data: { code: 'failed' } });
    socket.destroy();
    await server.stop();
  });

  it('answers two requests sent in one chunk in order', async () => {
    const { server, socket, next } = await setup();
    socket.write(encodeLine(req(1)) + encodeLine(req(2)));
    const rs = await next(2);
    expect(rs.map(r => r.id)).toEqual([1, 2]);
    socket.destroy();
    await server.stop();
  });

  it('destroys the socket when a line exceeds AI_MAX_LINE_BYTES', async () => {
    const { server, socket, closed } = await setup();
    socket.on('error', () => undefined);
    socket.write('a'.repeat(AI_MAX_LINE_BYTES + 10));
    await closed;
    await server.stop();
  });
});
