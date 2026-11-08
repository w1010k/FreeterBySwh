/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Manual check with the real CLIs (FREETER_AGENT_E2E=1): a conversation id the CLI does not have.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAiAgentRunner } from '@/application/ai/aiAgentRunner';
import { buildAgentArgs, findOnPath, spawnSpec } from '@/infra/aiAgent/agentCommand';
import { AgentEvent, AgentTool } from '@common/ai/agent';

const enabled = process.env.FREETER_AGENT_E2E === '1';

(enabled ? describe : describe.skip)('agent runner: a lost conversation with the real CLIs', () => {
  jest.setTimeout(240000);

  const cases = [['claude', 'haiku', '00000000-0000-4000-8000-000000000000'], ['codex', undefined, '01a1b6a0-0000-7000-8000-000000000000']] as const;
  it.each(cases)('%s starts a new conversation and answers the same prompt', async (tool: AgentTool, model: string | undefined, gone: string) => {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-agent-lost '));
    const mcp = { command: process.execPath, args: [resolve('build/cli.js'), 'mcp'], env: { FREETER_AI_ENDPOINT: process.env.FREETER_AI_ENDPOINT ?? '', FREETER_AI_ORIGIN: 'agent-runner' } };
    const mcpConfigPath = join(dir, 'mcp.json');
    await writeFile(mcpConfigPath, JSON.stringify({ mcpServers: { freeter: mcp } }));
    const events: AgentEvent[] = [];
    const runner = createAiAgentRunner({
      findProgram: t => findOnPath(process.platform === 'win32' ? [`${t}.exe`, `${t}.cmd`] : [t], process.env.PATH ?? ''),
      spawn: (program, args) => {
        const spec = spawnSpec(program, args, process.platform);
        return spawn(spec.command, spec.args, { cwd: dir, windowsVerbatimArguments: spec.verbatim, windowsHide: true });
      },
      kill: proc => (proc as ReturnType<typeof spawn>).kill(),
      emit: (_id, e) => events.push(e),
      argsFor: (t, o) => buildAgentArgs(t, { mcpConfigPath, mcp, ...o }),
      newId: () => 'c1',
      timeoutMs: 200000,
      idleMs: 60000,
    });
    expect(runner.send(null, { tool, prompt: 'Reply with the single word: pong', model, resume: gone })).toMatchObject({ ok: true });
    await new Promise<void>(res => {
      const t = setInterval(() => {
        if (events.some(e => e.type === 'done' || e.type === 'error')) {
          clearInterval(t);
          res();
        }
      }, 200);
    });
    runner.stopAll();
    const text = events.filter(e => e.type === 'textDelta' || e.type === 'text').map(e => (e as { text: string }).text).join('');
    console.log(tool, JSON.stringify(events.filter(e => e.type !== 'textDelta' && e.type !== 'text')), JSON.stringify(text));
    expect(events[0]).toMatchObject({ type: 'notice', sessionLost: true });
    expect(events.some(e => e.type === 'done')).toBe(true);
  });
});
