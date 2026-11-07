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
  /** Continues that conversation (Claude session id / Codex thread id). */
  sessionId?: string;
}

/** A TOML basic string (JSON's escaping is valid TOML for these values). */
const toml = (s: string) => JSON.stringify(s);

/**
 * The command line for one turn; the prompt goes in on stdin. Verified 2026-11-07 with
 * Claude Code 2.1.319 and Codex CLI 0.164.0 (spec "검증 결과").
 */
export function buildAgentArgs(tool: AgentTool, o: AgentArgsOptions): string[] {
  if (tool === 'claude') {
    return [
      // No built-in tools (files, shell, web): only the Freeter MCP server.
      '-p', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', o.mcpConfigPath,
      '--allowedTools', 'mcp__freeter', '--output-format', 'stream-json', '--verbose',
      ...(o.model ? ['--model', o.model] : []),
      ...(o.effort ? ['--effort', o.effort] : []),
      ...(o.sessionId ? ['--resume', o.sessionId] : []),
    ];
  }
  const env = Object.entries(o.mcp.env).map(([k, v]) => `${toml(k)}=${toml(v)}`).join(',');
  return [
    // Codex cannot turn its shell off; read-only keeps it from changing files.
    'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
    '-c', `mcp_servers.freeter.command=${toml(o.mcp.command)}`,
    '-c', `mcp_servers.freeter.args=[${o.mcp.args.map(toml).join(',')}]`,
    '-c', `mcp_servers.freeter.env={${env}}`,
    // Codex blocks MCP calls in exec mode otherwise; Freeter asks the user itself.
    '-c', 'mcp_servers.freeter.default_tools_approval_mode="approve"',
    ...(o.model ? ['-m', o.model] : []),
    ...(o.effort ? ['-c', `model_reasoning_effort=${toml(o.effort)}`] : []),
    ...(o.sessionId ? ['resume', o.sessionId] : []),
    '-',
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
