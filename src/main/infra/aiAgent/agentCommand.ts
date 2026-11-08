/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { AgentEffort, AgentTool } from '@common/ai/agent';

export interface AgentMcpServer {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentArgsOptions {
  /** Claude reads its MCP servers from this JSON file. */
  mcpConfigPath: string;
  /** The `freeter mcp` server, for Codex (passed inline). */
  mcp: AgentMcpServer;
  model?: string;
  effort?: AgentEffort;
  /** Continues that Claude Code session (Codex resumes its thread in the protocol, see agentSession.ts). */
  sessionId?: string;
}

/** A TOML basic string (JSON's escaping is valid TOML for these values). */
const toml = (s: string) => JSON.stringify(s);

/**
 * The command line of a conversation's CLI process; prompts go in on stdin (see agentSession.ts).
 * Verified 2026-11-08 with Claude Code 2.1.319 and Codex CLI 0.164.0.
 */
export function buildAgentArgs(tool: AgentTool, o: AgentArgsOptions): string[] {
  if (tool === 'claude') {
    return [
      // No built-in tools (files, shell, web): only the Freeter MCP server.
      '-p', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', o.mcpConfigPath,
      '--allowedTools', 'mcp__freeter', '--output-format', 'stream-json', '--verbose',
      // One process per conversation: prompts come as stream-json lines; the answer streams as it is written.
      '--input-format', 'stream-json', '--include-partial-messages',
      ...(o.model ? ['--model', o.model] : []),
      ...(o.effort ? ['--effort', o.effort] : []),
      ...(o.sessionId ? ['--resume', o.sessionId] : []),
    ];
  }
  const env = Object.entries(o.mcp.env).map(([k, v]) => `${toml(k)}=${toml(v)}`).join(',');
  return [
    // One process per conversation (JSON-RPC on stdin/stdout, see agentSession.ts); its thread runs read-only.
    // Also set per thread (agentSession.ts); this keeps read-only if the user's config.toml says otherwise.
    // No shell (like Claude's --tools ""): a command Codex ran would pass no Freeter confirm box (verified with 0.164.0).
    'app-server', '-c', 'sandbox_mode="read-only"', '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false',
    '-c', `mcp_servers.freeter.command=${toml(o.mcp.command)}`,
    '-c', `mcp_servers.freeter.args=[${o.mcp.args.map(toml).join(',')}]`,
    '-c', `mcp_servers.freeter.env={${env}}`,
    // Codex asks before MCP calls otherwise; Freeter asks the user itself.
    '-c', 'mcp_servers.freeter.default_tools_approval_mode="approve"',
    ...(o.model ? ['-c', `model=${toml(o.model)}`] : []),
    ...(o.effort ? ['-c', `model_reasoning_effort=${toml(o.effort)}`] : []),
  ];
}

/** The first of `names` found in a PATH folder (blocking: call it rarely). */
export function findOnPath(names: string[], envPath: string): string | undefined {
  for (const dir of envPath.split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

// cmd.exe quoting, as cross-spawn does it (lib/util/escape.js, MIT).
const metaChars = /([()\][%!^"`<>&|;, *?])/g;
const escapeCommand = (cmd: string) => cmd.replace(metaChars, '^$1');
function escapeArgument(arg: string, doubleEscape: boolean): string {
  let a = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  a = a.replace(/(?=(\\+?)?)\1$/, '$1$1');
  a = `"${a}"`.replace(metaChars, '^$1');
  return doubleEscape ? a.replace(metaChars, '^$1') : a;
}

export interface SpawnSpec {
  command: string;
  args: string[];
  /** Pass args to the process as they are (Node's windowsVerbatimArguments). */
  verbatim: boolean;
}

/**
 * Ends a CLI with its children (`freeter mcp`, whose open call holds a confirm box; model processes).
 * On POSIX the CLI is started detached, so it leads its own process group.
 */
export function killTree(
  pid: number,
  platform: NodeJS.Platform,
  deps: { run: (command: string, args: string[]) => void; kill: (pid: number, signal: NodeJS.Signals) => void }
): void {
  if (platform === 'win32') {
    deps.run('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    deps.kill(-pid, 'SIGTERM');
  }
}

/**
 * A CLI that exits by itself (crash) leaves its children; on POSIX they end with it here. Windows has no
 * process groups (taskkill /T needs the parent alive); there `freeter mcp` ends when its open call does.
 */
export function endGroupWithLeader(
  child: { pid?: number; once(event: 'exit', fn: () => void): unknown },
  platform: NodeJS.Platform,
  kill: (pid: number, signal: NodeJS.Signals) => void
): void {
  const pid = child.pid;
  if (platform !== 'win32' && pid !== undefined) {
    child.once('exit', () => kill(-pid, 'SIGTERM'));
  }
}

/**
 * Node cannot spawn a .cmd/.bat without a shell, and npm installs CLIs such as
 * codex as .cmd shims. Those run through cmd.exe with every argument quoted. The
 * shim passes them on with %*, which cmd.exe expands once more, hence the double escape.
 */
export function spawnSpec(program: string, args: string[], platform: NodeJS.Platform): SpawnSpec {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(program)) {
    return { command: program, args, verbatim: false };
  }
  const line = [escapeCommand(program), ...args.map(a => escapeArgument(a, true))].join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], verbatim: true };
}
