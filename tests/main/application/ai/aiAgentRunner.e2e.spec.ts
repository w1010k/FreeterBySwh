/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Manual end-to-end check with the real CLIs, off by default (it uses subscription quota).
 * Run with a repo build of Freeter running (yarn prod && yarn prod:run):
 *   FREETER_AGENT_E2E=1 FREETER_AI_ENDPOINT=<appData>/freeter-swh-dev/freeter-data/ai/endpoint.json yarn test aiAgentRunner.e2e
 * Only reads (app.describe), so no confirm box is needed.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAiAgentRunner } from '@/application/ai/aiAgentRunner';
import { buildAgentArgs, findOnPath, spawnSpec } from '@/infra/aiAgent/agentCommand';
import { AgentEvent, AgentTool } from '@common/ai/agent';

const enabled = process.env.FREETER_AGENT_E2E === '1';

(enabled ? describe : describe.skip)('agent runner with the real CLIs', () => {
  jest.setTimeout(240000);

  async function makeRunner() {
    const dir = await mkdtemp(join(tmpdir(), 'freeter-agent-e2e '));
    const mcp = {
      command: process.execPath,
      args: [resolve('build/cli.js'), 'mcp'],
      env: { FREETER_AI_ENDPOINT: process.env.FREETER_AI_ENDPOINT ?? '', FREETER_AI_ORIGIN: 'agent-runner' },
    };
    const mcpConfigPath = join(dir, 'mcp.json');
    await writeFile(mcpConfigPath, JSON.stringify({ mcpServers: { freeter: mcp } }));
    const events: AgentEvent[] = [];
    let onDone: () => void = () => undefined;
    const runner = createAiAgentRunner({
      findProgram: tool => findOnPath(process.platform === 'win32' ? [`${tool}.exe`, `${tool}.cmd`] : [tool], process.env.PATH ?? ''),
      spawn: (program, args) => {
        const spec = spawnSpec(program, args, process.platform);
        return spawn(spec.command, spec.args, { cwd: dir, windowsVerbatimArguments: spec.verbatim, windowsHide: true });
      },
      kill: proc => (proc as ReturnType<typeof spawn>).kill(),
      emit: (_id, e) => {
        events.push(e);
        if (e.type === 'done' || e.type === 'error') {
          onDone();
        }
      },
      argsFor: (tool, o) => buildAgentArgs(tool, { mcpConfigPath, mcp, ...o }),
      newId: (() => { let n = 0; return () => `c${++n}`; })(),
      timeoutMs: 200000,
      idleMs: 60000,
    });
    const turn = (conversationId: string | null, tool: AgentTool, prompt: string, model?: string, resume?: string) => new Promise<AgentEvent[]>(res => {
      events.length = 0;
      onDone = () => setTimeout(() => res([...events]), 200);
      const r = runner.send(conversationId, { tool, prompt, model, resume });
      if (!r.ok) {
        res([{ type: 'error', message: r.message }]);
      }
    });
    return { turn, runner };
  }

  it.each([['claude', 'haiku'], ['codex', undefined]] as const)('%s reads Freeter through the MCP server and resumes the conversation', async (tool, model) => {
    const { turn, runner } = await makeRunner();
    const first = await turn(null, tool, 'Call the Freeter app_describe tool and answer with only the name of the first workflow.', model);
    expect(first.filter(e => e.type === 'error')).toEqual([]);
    expect(first.some(e => e.type === 'tool' && e.name.includes('app_describe'))).toBe(true);
    const done = first.find(e => e.type === 'done');
    expect(done && 'sessionId' in done && done.sessionId).toBeTruthy();
    const text = first.filter(e => e.type === 'text' || e.type === 'textDelta').map(e => (e as { text: string }).text).join('');
    const second = await turn('c1', tool, 'Repeat your previous answer exactly, without calling any tool.', model);
    expect(second.filter(e => e.type === 'error')).toEqual([]);
    const text2 = second.filter(e => e.type === 'text' || e.type === 'textDelta').map(e => (e as { text: string }).text).join('');
    expect(text2.trim().length).toBeGreaterThan(0);
    // After an app restart: a new conversation in a new process continues the CLI conversation.
    runner.stopAll();
    const sessionId = (done as { sessionId: string }).sessionId;
    const third = await turn(null, tool, 'What was the first word of your previous answer? Reply with that word only.', model, sessionId);
    expect(third.filter(e => e.type === 'error')).toEqual([]);
    const text3 = third.filter(e => e.type === 'text' || e.type === 'textDelta').map(e => (e as { text: string }).text).join('');
    runner.stopAll();
    console.log(tool, JSON.stringify({ text, text2, text3 }));
  });
});
