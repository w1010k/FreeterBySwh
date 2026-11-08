/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { buildAgentArgs, endGroupWithLeader, findOnPath, killTree, spawnSpec } from '@/infra/aiAgent/agentCommand';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mcp = { command: 'C:\\App\\Freeter.exe', args: ['C:\\App\\cli.js', 'mcp'], env: { FREETER_AI_ENDPOINT: 'C:\\d\\endpoint.json', FREETER_AI_ORIGIN: 'agent-runner' } };

describe('buildAgentArgs', () => {
  it('runs Claude with no built-in tools, only the Freeter MCP server, streaming JSON', () => {
    expect(buildAgentArgs('claude', { mcpConfigPath: 'C:\\d\\mcp.json', mcp })).toEqual([
      '-p', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', 'C:\\d\\mcp.json',
      '--allowedTools', 'mcp__freeter', '--output-format', 'stream-json', '--verbose',
      '--input-format', 'stream-json', '--include-partial-messages'
    ]);
  });

  it('adds model, effort and resume for Claude', () => {
    const args = buildAgentArgs('claude', { mcpConfigPath: 'm', mcp, model: 'sonnet', effort: 'high', sessionId: 'abc-1' });
    expect(args.slice(-6)).toEqual(['--model', 'sonnet', '--effort', 'high', '--resume', 'abc-1']);
  });

  it('runs the Codex app server with no shell, the Freeter MCP server auto-approved (sandbox and thread go in its protocol)', () => {
    expect(buildAgentArgs('codex', { mcpConfigPath: 'm', mcp })).toEqual([
      'app-server', '-c', 'sandbox_mode="read-only"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false',
      '-c', 'mcp_servers.freeter.command="C:\\\\App\\\\Freeter.exe"',
      '-c', 'mcp_servers.freeter.args=["C:\\\\App\\\\cli.js","mcp"]',
      '-c', 'mcp_servers.freeter.env={"FREETER_AI_ENDPOINT"="C:\\\\d\\\\endpoint.json","FREETER_AI_ORIGIN"="agent-runner"}',
      '-c', 'mcp_servers.freeter.default_tools_approval_mode="approve"'
    ]);
  });

  it('adds model and effort for Codex as config (the thread to resume goes in its protocol)', () => {
    const args = buildAgentArgs('codex', { mcpConfigPath: 'm', mcp, model: 'gpt-5', effort: 'low', sessionId: 't-1' });
    expect(args.slice(-4)).toEqual(['-c', 'model="gpt-5"', '-c', 'model_reasoning_effort="low"']);
  });
});

describe('findOnPath', () => {
  it('finds the first existing program in PATH order', async () => {
    const a = await mkdtemp(join(tmpdir(), 'fp-a-'));
    const b = await mkdtemp(join(tmpdir(), 'fp-b-'));
    await writeFile(join(b, 'codex.cmd'), '');
    expect(findOnPath(['codex.exe', 'codex.cmd'], [a, b].join(process.platform === 'win32' ? ';' : ':'))).toBe(join(b, 'codex.cmd'));
    expect(findOnPath(['nope.exe'], a)).toBeUndefined();
  });
});

describe('killTree', () => {
  it('ends the CLI with its children (freeter mcp and its confirm box) on every platform', () => {
    const run = jest.fn();
    const kill = jest.fn();
    killTree(42, 'win32', { run, kill });
    expect(run).toHaveBeenCalledWith('taskkill', ['/PID', '42', '/T', '/F']);
    killTree(42, 'darwin', { run, kill });
    expect(kill).toHaveBeenCalledWith(-42, 'SIGTERM'); // the process group of a detached CLI
  });
});

describe('endGroupWithLeader', () => {
  it('ends what is left of the group when the CLI exits by itself (POSIX), and does nothing on Windows', () => {
    const kill = jest.fn();
    const child = Object.assign(new EventEmitter(), { pid: 42 });
    endGroupWithLeader(child, 'linux', kill);
    child.emit('exit', 1);
    expect(kill).toHaveBeenCalledWith(-42, 'SIGTERM');
    const win = Object.assign(new EventEmitter(), { pid: 43 });
    endGroupWithLeader(win, 'win32', kill);
    win.emit('exit', 1);
    expect(kill).toHaveBeenCalledTimes(1);
  });
});

describe('spawnSpec', () => {
  it('runs an executable directly', () => {
    expect(spawnSpec('C:\\x\\claude.exe', ['-p', ''], 'win32')).toEqual({ command: 'C:\\x\\claude.exe', args: ['-p', ''], verbatim: false });
  });

  it('runs a .cmd through cmd.exe with every argument quoted and cmd meta characters escaped twice', () => {
    const spec = spawnSpec('C:\\npm dir\\codex.cmd', ['-c', 'a="b c"', '&x'], 'win32');
    expect(spec.command).toBe('cmd.exe');
    expect(spec.verbatim).toBe(true);
    expect(spec.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(spec.args[3]).toBe('"C:\\npm^ dir\\codex.cmd ^^^"-c^^^" ^^^"a=\\^^^"b^^^ c\\^^^"^^^" ^^^"^^^&x^^^""');
  });
});

describe('spawnSpec through a real npm-style .cmd shim', () => {
  // The shim has the same shape npm writes for global CLIs such as codex.cmd.
  (process.platform === 'win32' ? it : it.skip)('delivers every argument unchanged', async () => {
    const { spawnSync } = await import('node:child_process');
    const dir = await mkdtemp(join(tmpdir(), 'shim dir '));
    await writeFile(join(dir, 'echo.js'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    await writeFile(join(dir, 'echo.cmd'), `@"${process.execPath}" "%~dp0\\echo.js" %*\r\n`);
    const args = buildAgentArgs('codex', { mcpConfigPath: 'm', mcp: { ...mcp, args: ['C:\\a b\\cli.js', 'mcp'] }, model: 'gpt-5', sessionId: 't-1' })
      .concat(['', 'a&b|c', '100%', 'x^y', 'end\\']);
    const spec = spawnSpec(join(dir, 'echo.cmd'), args, 'win32');
    const res = spawnSync(spec.command, spec.args, { windowsVerbatimArguments: spec.verbatim, encoding: 'utf8' });
    expect(JSON.parse(res.stdout)).toEqual(args);
  });
});
