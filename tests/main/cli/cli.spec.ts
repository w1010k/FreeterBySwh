/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { PassThrough } from 'node:stream';
import { createServer } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiClient, CliIo, connectAiClient, createReconnectingAiClient, defaultEndpointPath, runCli } from '@/cli/cli';
import { AiOrigin, AiRpcResult } from '@common/ai/protocol';

function makeIo(env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    stdin: new PassThrough(),
    stdout: { write: (s: string) => out.push(s) },
    stderr: { write: (s: string) => err.push(s) },
    env: { FREETER_AI_ENDPOINT: 'ep.json', ...env },
  };
  return { io, out: () => out.join(''), err: () => err.join('') };
}

function fakeConnect(results: Partial<Record<'actions.list' | 'actions.run', AiRpcResult>>) {
  const client: AiClient = {
    call: jest.fn(async (method: 'actions.list' | 'actions.run'): Promise<AiRpcResult> => results[method] ?? { ok: true, value: null }),
    close: jest.fn(),
    isClosed: () => false,
  };
  const connect = jest.fn(async (_path: string, _origin: AiOrigin) => client);
  return { client, connect };
}

const list: AiRpcResult = { ok: true, value: [{ id: 'app.describe', description: 'Describe', kind: 'read', inputSchema: {} }] };

describe('runCli', () => {
  it('run prints the JSON value and returns 0', async () => {
    const { io, out } = makeIo();
    const { client, connect } = fakeConnect({ 'actions.run': { ok: true, value: { workflowId: 'w' } } });
    await expect(runCli(['run', 'workflow.create', '--input', '{"projectId":"p"}'], io, connect)).resolves.toBe(0);
    expect(JSON.parse(out())).toEqual({ workflowId: 'w' });
    expect(client.call).toHaveBeenCalledWith('actions.run', { actionId: 'workflow.create', input: { projectId: 'p' } });
    expect(connect).toHaveBeenCalledWith('ep.json', 'cli');
  });

  it('run --input - reads the JSON from stdin (shells such as PowerShell strip quotes from arguments)', async () => {
    const { io } = makeIo();
    const { client, connect } = fakeConnect({});
    (io.stdin as PassThrough).end('{"name":"회의"}');
    await expect(runCli(['run', 'workflow.rename', '--input', '-'], io, connect)).resolves.toBe(0);
    expect(client.call).toHaveBeenCalledWith('actions.run', { actionId: 'workflow.rename', input: { name: '회의' } });
  });

  it('run --input-file reads the JSON from a UTF-8 file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-in-'));
    const file = join(dir, 'in.json');
    await writeFile(file, '{"name":"회의"}');
    const { io } = makeIo();
    const { client, connect } = fakeConnect({});
    await expect(runCli(['run', 'workflow.rename', '--input-file', file], io, connect)).resolves.toBe(0);
    expect(client.call).toHaveBeenCalledWith('actions.run', { actionId: 'workflow.rename', input: { name: '회의' } });
    const bad = makeIo();
    await expect(runCli(['run', 'x.y', '--input-file', join(dir, 'missing.json')], bad.io, connect)).resolves.toBe(2);
  });

  it('run without --input sends {}', async () => {
    const { io } = makeIo();
    const { client, connect } = fakeConnect({});
    await runCli(['run', 'app.describe'], io, connect);
    expect(client.call).toHaveBeenCalledWith('actions.run', { actionId: 'app.describe', input: {} });
  });

  it('run returns 1 and prints "denied: ..." to stderr when the action is denied', async () => {
    const { io, err } = makeIo();
    const { connect } = fakeConnect({ 'actions.run': { ok: false, code: 'denied', message: 'The user denied the action' } });
    await expect(runCli(['run', 'x.y'], io, connect)).resolves.toBe(1);
    expect(err()).toContain('denied: The user denied the action');
  });

  it('returns 2 for unknown command and for --input that is not JSON', async () => {
    const { io, err } = makeIo();
    const { connect } = fakeConnect({});
    await expect(runCli(['nope'], io, connect)).resolves.toBe(2);
    await expect(runCli(['run', 'x.y', '--input', '{bad'], io, connect)).resolves.toBe(2);
    await expect(runCli([], io, connect)).resolves.toBe(2);
    expect(err()).toContain('Usage');
    expect(connect).not.toHaveBeenCalled();
  });

  it('mcp starts even when Freeter is not running yet, and connects on the first call', async () => {
    const { io, out } = makeIo();
    const connect = jest.fn(async () => {
      throw new Error('Freeter is not running');
    });
    (io.stdin as PassThrough).end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + String.fromCharCode(10));
    await expect(runCli(['mcp'], io, connect)).resolves.toBe(0);
    expect(JSON.parse(out().trim())).toMatchObject({ id: 1, error: { message: 'Freeter is not running' } });
  });

  it('run retries once with a fresh endpoint when the token is refused', async () => {
    const { io, out } = makeIo();
    const stale: AiClient = { call: jest.fn(async () => ({ ok: false, code: 'unauthorized', message: 'Invalid token' }) as AiRpcResult), close: jest.fn(), isClosed: () => false };
    const fresh: AiClient = { call: jest.fn(async () => ({ ok: true, value: 7 }) as AiRpcResult), close: jest.fn(), isClosed: () => false };
    const connect = jest.fn().mockResolvedValueOnce(stale).mockResolvedValueOnce(fresh);
    await expect(runCli(['run', 'app.describe'], io, connect)).resolves.toBe(0);
    expect(JSON.parse(out())).toBe(7);
  });

  it('returns 3 with "Freeter is not running" when connect throws', async () => {
    const { io, err } = makeIo();
    const connect = jest.fn(async () => {
      throw new Error('Freeter is not running');
    });
    await expect(runCli(['actions'], io, connect)).resolves.toBe(3);
    expect(err()).toContain('Freeter is not running');
  });

  it('actions prints one line per action, and --json prints the list', async () => {
    const a = makeIo();
    await runCli(['actions'], a.io, fakeConnect({ 'actions.list': list }).connect);
    expect(a.out()).toContain('app.describe');
    expect(a.out()).toContain('read');
    const b = makeIo();
    await runCli(['actions', '--json'], b.io, fakeConnect({ 'actions.list': list }).connect);
    expect(JSON.parse(b.out())).toEqual(list.ok && list.value);
  });

  it('guide prints usage with the action list', async () => {
    const { io, out } = makeIo();
    await expect(runCli(['guide'], io, fakeConnect({ 'actions.list': list }).connect)).resolves.toBe(0);
    expect(out()).toContain('freeter run');
    expect(out()).toContain('app.describe');
  });

  it('mcp uses FREETER_AI_ORIGIN when set (the app agent runner), else mcp', async () => {
    // The connection opens on the first call.
    const a = makeIo({ FREETER_AI_ORIGIN: 'terminal' });
    (a.io.stdin as PassThrough).end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + String.fromCharCode(10));
    const ca = fakeConnect({});
    await runCli(['mcp'], a.io, ca.connect);
    expect(ca.connect).toHaveBeenCalledWith('ep.json', 'terminal');
    const b = makeIo();
    (b.io.stdin as PassThrough).end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + String.fromCharCode(10));
    const cb = fakeConnect({});
    await runCli(['mcp'], b.io, cb.connect);
    expect(cb.connect).toHaveBeenCalledWith('ep.json', 'mcp');
  });

  it('uses FREETER_AI_ORIGIN when it is a valid origin, else cli', async () => {
    const a = makeIo({ FREETER_AI_ORIGIN: 'terminal' });
    const ca = fakeConnect({ 'actions.list': list });
    await runCli(['actions'], a.io, ca.connect);
    expect(ca.connect).toHaveBeenCalledWith('ep.json', 'terminal');
    const b = makeIo({ FREETER_AI_ORIGIN: 'evil' });
    const cb = fakeConnect({ 'actions.list': list });
    await runCli(['actions'], b.io, cb.connect);
    expect(cb.connect).toHaveBeenCalledWith('ep.json', 'cli');
  });
});

test('the agent guide says write actions may run without a dialog when the user allowed that', async () => {
  const { guideText } = await import('@/cli/cli');
  expect(guideText([])).toMatch(/always allow/i);
});

describe('createReconnectingAiClient', () => {
  const makeClient = (closed: boolean, value: unknown): AiClient => ({
    call: jest.fn(async () => ({ ok: true, value }) as AiRpcResult),
    close: jest.fn(),
    isClosed: () => closed,
  });

  it('reconnects when the current connection is closed (Freeter restarted)', async () => {
    const reopen = jest.fn(async () => makeClient(false, 'new'));
    const client = createReconnectingAiClient(makeClient(true, 'old'), reopen);
    await expect(client.call('actions.list', {})).resolves.toEqual({ ok: true, value: 'new' });
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('shares one reconnect between calls made at the same time', async () => {
    const reopen = jest.fn(async () => makeClient(false, 'new'));
    const client = createReconnectingAiClient(makeClient(true, 'old'), reopen);
    await Promise.all([client.call('actions.list', {}), client.call('actions.list', {})]);
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('close closes the connection in use, not the first one', async () => {
    const fresh = makeClient(false, 'new');
    const client = createReconnectingAiClient(makeClient(true, 'old'), async () => fresh);
    await client.call('actions.list', {});
    client.close();
    expect(fresh.close).toHaveBeenCalledTimes(1);
  });

  it('reads the endpoint again once when the token is refused (Freeter restarted, old endpoint.json)', async () => {
    const stale: AiClient = { call: jest.fn(async () => ({ ok: false, code: 'unauthorized', message: 'Invalid token' }) as AiRpcResult), close: jest.fn(), isClosed: () => false };
    const reopen = jest.fn(async () => makeClient(false, 'fresh'));
    const client = createReconnectingAiClient(stale, reopen);
    await expect(client.call('actions.list', {})).resolves.toEqual({ ok: true, value: 'fresh' });
    expect(stale.close).toHaveBeenCalled();
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('a refused call that comes back after another call already reconnected retries on the new connection without closing it', async () => {
    let answerLate: (r: AiRpcResult) => void = () => undefined;
    const refused = { ok: false, code: 'unauthorized', message: 'Invalid token' } as AiRpcResult;
    const stale: AiClient = {
      call: jest.fn()
        .mockImplementationOnce(async () => refused)
        .mockImplementationOnce(() => new Promise<AiRpcResult>(r => { answerLate = r; })),
      close: jest.fn(),
      isClosed: () => false
    };
    const fresh = makeClient(false, 'fresh');
    const reopen = jest.fn(async () => fresh);
    const client = createReconnectingAiClient(stale, reopen);
    const a = client.call('actions.list', {});
    const b = client.call('actions.list', {});
    await expect(a).resolves.toEqual({ ok: true, value: 'fresh' });
    answerLate(refused);
    await expect(b).resolves.toEqual({ ok: true, value: 'fresh' });
    expect(fresh.close).not.toHaveBeenCalled();
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('a call that comes in while a refused call reconnects waits for the new connection', async () => {
    const refused = { ok: false, code: 'unauthorized', message: 'Invalid token' } as AiRpcResult;
    let closed = false;
    const stale: AiClient = {
      call: jest.fn(async () => (closed ? { ok: false, code: 'failed', message: 'Freeter closed the connection' } as AiRpcResult : refused)),
      close: jest.fn(() => { closed = true; }),
      isClosed: () => false
    };
    let open: (c: AiClient) => void = () => undefined;
    const reopen = jest.fn(() => new Promise<AiClient>(r => { open = r; }));
    const client = createReconnectingAiClient(stale, reopen);
    const a = client.call('actions.list', {});
    await new Promise(r => setImmediate(r));
    const b = client.call('actions.list', {});
    open(makeClient(false, 'fresh'));
    await expect(a).resolves.toEqual({ ok: true, value: 'fresh' });
    await expect(b).resolves.toEqual({ ok: true, value: 'fresh' });
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('two calls refused at the same time both retry on the one new connection', async () => {
    const refused = { ok: false, code: 'unauthorized', message: 'Invalid token' } as AiRpcResult;
    const answers: ((r: AiRpcResult) => void)[] = [];
    const stale: AiClient = { call: jest.fn(() => new Promise<AiRpcResult>(r => answers.push(r))), close: jest.fn(), isClosed: () => false };
    let open: (c: AiClient) => void = () => undefined;
    const reopen = jest.fn(() => new Promise<AiClient>(r => { open = r; }));
    const client = createReconnectingAiClient(stale, reopen);
    const a = client.call('actions.list', {});
    const b = client.call('actions.list', {});
    answers[0](refused);
    await new Promise(r => setImmediate(r));
    answers[1](refused);
    await new Promise(r => setImmediate(r));
    open(makeClient(false, 'fresh'));
    await expect(a).resolves.toEqual({ ok: true, value: 'fresh' });
    await expect(b).resolves.toEqual({ ok: true, value: 'fresh' });
  });

  it('a call that failed because another refused call closed the shared connection retries on the new one', async () => {
    const refused = { ok: false, code: 'unauthorized', message: 'Invalid token' } as AiRpcResult;
    const closedRes = { ok: false, code: 'failed', message: 'Freeter closed the connection' } as AiRpcResult;
    const answers: ((r: AiRpcResult) => void)[] = [];
    const stale: AiClient = {
      call: jest.fn(() => new Promise<AiRpcResult>(r => answers.push(r))), close: jest.fn(() => answers[1]?.(closedRes)), isClosed: () => false
    };
    const reopen = jest.fn(async () => makeClient(false, 'fresh'));
    const client = createReconnectingAiClient(stale, reopen);
    const a = client.call('actions.list', {});
    const b = client.call('actions.list', {});
    answers[0](refused);
    await expect(a).resolves.toEqual({ ok: true, value: 'fresh' });
    await expect(b).resolves.toEqual({ ok: true, value: 'fresh' });
  });

  it('a call whose connection closed while another call reconnected (no refusal) is not sent again (it may have run)', async () => {
    const closedRes = { ok: false, code: 'failed', message: 'Freeter closed the connection' } as AiRpcResult;
    let closed = false;
    let answerA: (r: AiRpcResult) => void = () => undefined;
    const first: AiClient = {
      call: jest.fn(() => new Promise<AiRpcResult>(r => { answerA = r; })),
      close: jest.fn(),
      isClosed: () => closed
    };
    const fresh = makeClient(false, 'fresh');
    const client = createReconnectingAiClient(first, async () => fresh);
    const a = client.call('actions.run', {});
    closed = true;
    await client.call('actions.list', {});
    answerA(closedRes);
    await expect(a).resolves.toEqual(closedRes);
    expect(fresh.call).toHaveBeenCalledTimes(1);
  });

  it('close during a reconnect also closes the connection that reconnect opens', async () => {
    const refused = { ok: false, code: 'unauthorized', message: 'Invalid token' } as AiRpcResult;
    const stale: AiClient = { call: jest.fn(async () => refused), close: jest.fn(), isClosed: () => false };
    let open: (c: AiClient) => void = () => undefined;
    const client = createReconnectingAiClient(stale, () => new Promise<AiClient>(r => { open = r; }));
    const pending = client.call('actions.list', {});
    await new Promise(r => setImmediate(r));
    client.close();
    const fresh = makeClient(false, 'fresh');
    open(fresh);
    await pending;
    expect(fresh.close).toHaveBeenCalled();
  });

  it('keeps the open connection', async () => {
    const reopen = jest.fn();
    const client = createReconnectingAiClient(makeClient(false, 'same'), reopen);
    await expect(client.call('actions.list', {})).resolves.toEqual({ ok: true, value: 'same' });
    expect(reopen).not.toHaveBeenCalled();
  });

  it('returns a failure when Freeter is still not running', async () => {
    const client = createReconnectingAiClient(makeClient(true, 'old'), async () => {
      throw new Error('Freeter is not running');
    });
    await expect(client.call('actions.list', {})).resolves.toEqual({ ok: false, code: 'failed', message: 'Freeter is not running' });
  });
});

describe('defaultEndpointPath', () => {
  it('uses FREETER_AI_ENDPOINT first', () => {
    expect(defaultEndpointPath({ FREETER_AI_ENDPOINT: 'x' }, 'win32', 'H')).toBe('x');
  });
  it('uses APPDATA on Windows and XDG_CONFIG_HOME or ~/.config on Linux', () => {
    expect(defaultEndpointPath({ APPDATA: 'A' }, 'win32', 'H')).toBe(join('A', 'freeter-swh', 'freeter-data', 'ai', 'endpoint.json'));
    expect(defaultEndpointPath({ XDG_CONFIG_HOME: 'X' }, 'linux', 'H')).toBe(join('X', 'freeter-swh', 'freeter-data', 'ai', 'endpoint.json'));
    expect(defaultEndpointPath({}, 'linux', 'H')).toBe(join('H', '.config', 'freeter-swh', 'freeter-data', 'ai', 'endpoint.json'));
  });
});

describe('connectAiClient', () => {
  it('fails a call at once after Freeter closed the connection, instead of hanging', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-cli-'));
    const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\freeter-close-test-${Date.now()}` : join(dir, 'c.sock');
    const server = createServer(s => s.destroy());
    await new Promise<void>(r => server.listen(pipe, () => r()));
    const file = join(dir, 'endpoint.json');
    await writeFile(file, JSON.stringify({ pipe, token: 't', pid: 1 }));
    const client = await connectAiClient(file, 'cli');
    await new Promise(r => setTimeout(r, 100));
    await expect(client.call('actions.list', {})).resolves.toMatchObject({ ok: false, code: 'failed' });
    expect(client.isClosed()).toBe(true);
    await new Promise<void>(r => server.close(() => r()));
  });

  it('rejects with "Freeter is not running" when endpoint.json is missing', async () => {
    await expect(connectAiClient(join(tmpdir(), 'no-such-freeter', 'endpoint.json'), 'cli')).rejects.toThrow('Freeter is not running');
  });

  it('rejects with "Freeter is not running" when endpoint.json points to a dead pipe', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-cli-'));
    const pipe = process.platform === 'win32' ? '\\\\.\\pipe\\freeter-dead-pipe-test' : join(dir, 'dead.sock');
    const file = join(dir, 'endpoint.json');
    await writeFile(file, JSON.stringify({ pipe, token: 't', pid: 1 }));
    await expect(connectAiClient(file, 'cli')).rejects.toThrow('Freeter is not running');
  });
});
