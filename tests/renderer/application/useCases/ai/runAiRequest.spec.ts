/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createRunAiRequestUseCase } from '@/application/useCases/ai/runAiRequest';
import { AiAction } from '@/base/ai/aiAction';
import { AppStore } from '@/application/interfaces/store';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { AiRpcRequest } from '@common/ai/protocol';

const run = (actionId: string, input?: unknown): AiRpcRequest =>
  ({ jsonrpc: '2.0', id: 1, method: 'actions.run', params: { token: 't', origin: 'mcp', actionId, input } });

function makeAction(overrides: Partial<AiAction<{ n: number }>> = {}): AiAction<{ n: number }> {
  return {
    id: 'thing.do',
    description: 'Do a thing',
    kind: 'write',
    inputSchema: { type: 'object' },
    parse: (input) => (typeof input === 'object' && input !== null && typeof (input as { n?: unknown }).n === 'number' ? input as { n: number } : undefined),
    describe: (input) => `Do thing ${input.n}`,
    run: jest.fn(() => ({ ok: true, value: 'done' } as const)),
    ...overrides
  };
}

async function setup(actions: AiAction[], confirmAnswer = true, appStoreOverride?: AppStore) {
  const [appStore] = await fixtureAppStore(fixtureAppState({}));
  const aiControl = { confirm: jest.fn(async () => confirmAnswer), respond: jest.fn(), ready: jest.fn() };
  const runAiRequestUseCase = createRunAiRequestUseCase({ actions, aiControl, appStore: appStoreOverride ?? appStore });
  return { aiControl, runAiRequestUseCase };
}

describe('runAiRequestUseCase()', () => {
  it('actions.list returns AiActionInfo for every action', async () => {
    const { runAiRequestUseCase } = await setup([makeAction()]);
    const res = await runAiRequestUseCase({ jsonrpc: '2.0', id: 1, method: 'actions.list', params: { token: 't', origin: 'cli' } });
    expect(res).toEqual({ ok: true, value: [{ id: 'thing.do', description: 'Do a thing', kind: 'write', inputSchema: { type: 'object' } }] });
  });

  it('returns not_ready while the app state is loading', async () => {
    const loadingStore = { get: () => ({ ...fixtureAppState({}), isLoading: true }) } as unknown as AppStore;
    const { runAiRequestUseCase } = await setup([makeAction()], true, loadingStore);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('returns unknown_action for an unknown id', async () => {
    const { runAiRequestUseCase } = await setup([makeAction()]);
    await expect(runAiRequestUseCase(run('nope'))).resolves.toMatchObject({ ok: false, code: 'unknown_action' });
  });

  it('returns invalid_input when parse returns undefined, without confirming', async () => {
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action]);
    await expect(runAiRequestUseCase(run('thing.do', { n: 'x' }))).resolves.toMatchObject({ ok: false, code: 'invalid_input' });
    expect(aiControl.confirm).not.toHaveBeenCalled();
    expect(action.run).not.toHaveBeenCalled();
  });

  it('runs a read action without confirming', async () => {
    const action = makeAction({ kind: 'read' });
    const { aiControl, runAiRequestUseCase } = await setup([action]);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toEqual({ ok: true, value: 'done' });
    expect(aiControl.confirm).not.toHaveBeenCalled();
  });

  it('confirms a write action with origin and describe, then runs it', async () => {
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action]);
    await expect(runAiRequestUseCase(run('thing.do', { n: 2 }), 7)).resolves.toEqual({ ok: true, value: 'done' });
    expect(aiControl.confirm).toHaveBeenCalledWith(7, 'mcp', 'Do thing 2');
    expect(action.run).toHaveBeenCalledWith({ n: 2 });
  });

  it('returns denied and does not run when confirm resolves false', async () => {
    const action = makeAction();
    const { runAiRequestUseCase } = await setup([action], false);
    await expect(runAiRequestUseCase(run('thing.do', { n: 2 }))).resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(action.run).not.toHaveBeenCalled();
  });

  it('returns failed with the error message when run throws', async () => {
    const action = makeAction({
      kind: 'read', run: () => {
        throw new Error('boom');
      }
    });
    const { runAiRequestUseCase } = await setup([action]);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toEqual({ ok: false, code: 'failed', message: 'boom' });
  });

  it('refuses a write whose confirm text is too long to show in full, without asking', async () => {
    const action = makeAction({ describe: () => 'x'.repeat(4001) });
    const { aiControl, runAiRequestUseCase } = await setup([action]);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'invalid_input' });
    expect(aiControl.confirm).not.toHaveBeenCalled();
    expect(action.run).not.toHaveBeenCalled();
  });

  it('does not run when what the action would do changed while the box was open', async () => {
    let text = 'Run echo hi';
    const action = makeAction({ describe: () => text });
    const { aiControl, runAiRequestUseCase } = await setup([action]);
    aiControl.confirm.mockImplementationOnce(async () => {
      text = 'Run curl evil';
      return true;
    });
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'failed' });
    expect(action.run).not.toHaveBeenCalled();
  });

  it('refuses writes while a Freeter settings window is open (its Save would undo them), reads still run', async () => {
    const state = fixtureAppState({});
    const withModal = { ...state, ui: { ...state.ui, modalScreens: { ...state.ui.modalScreens, order: ['projectManager'] } } };
    const store = { get: () => withModal } as unknown as AppStore;
    const write = makeAction();
    const read = makeAction({ id: 'thing.read', kind: 'read' });
    const { runAiRequestUseCase } = await setup([write, read], true, store);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'not_ready' });
    expect(write.run).not.toHaveBeenCalled();
    await expect(runAiRequestUseCase(run('thing.read', { n: 1 }))).resolves.toEqual({ ok: true, value: 'done' });
  });
});
