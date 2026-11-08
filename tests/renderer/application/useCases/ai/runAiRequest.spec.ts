/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createRunAiRequestUseCase } from '@/application/useCases/ai/runAiRequest';
import { AiAction } from '@/base/ai/aiAction';
import { AppStore } from '@/application/interfaces/store';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureAppConfig } from '@tests/base/fixtures/appConfig';
import { markRevealedByAi, resetAiActivity, takeRevealedByAi } from '@/base/ai/aiActivity';
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
  const aiControl = { confirm: jest.fn(async () => confirmAnswer), respond: jest.fn(), ready: jest.fn(), alive: jest.fn(async () => true) };
  const useCase = createRunAiRequestUseCase({ actions, aiControl, appStore: appStoreOverride ?? appStore });
  const runAiRequestUseCase = (req: AiRpcRequest, reqId = 7) => useCase(req, reqId);
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

  it('with "always allow" on, runs a write action without the confirm box', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toEqual({ ok: true, value: 'done' });
    expect(aiControl.confirm).not.toHaveBeenCalled();
  });

  it('with "always allow" on, still asks for an action that runs programs', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction({ alwaysConfirm: (input) => input.n === 2 });
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    await expect(runAiRequestUseCase(run('thing.do', { n: 2 }))).resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(aiControl.confirm).toHaveBeenCalledTimes(1);
  });

  it('with "always allow" on, still asks when the input points to another computer (any action)', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction({ parse: (input) => input as { n: number } });
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1, folder: '//host/share' }));
    expect(aiControl.confirm).toHaveBeenCalledTimes(1);
  });

  it('with "always allow" on, does not run a write whose request was cancelled or timed out meanwhile', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    aiControl.alive.mockResolvedValueOnce(false);
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }), 7)).resolves.toMatchObject({ ok: false, code: 'failed' });
    expect(aiControl.alive).toHaveBeenCalledWith(7);
    expect(action.run).not.toHaveBeenCalled();
  });

  it('text that only starts with two slashes (a code comment) is no path to another computer', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction({ parse: (input) => input as { n: number } });
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1, text: '// TODO: tidy up' }));
    expect(aiControl.confirm).not.toHaveBeenCalled();
  });

  it('marks the widgets that a write without the confirm box newly shows (a Terminal shown so waits for the user)', async () => {
    resetAiActivity();
    const state = fixtureAppState({
      entities: {
        workflows: {
          'W-1': { id: 'W-1', settings: { name: '1' }, layout: [{ id: 'L-1', widgetId: 'SHOWN', rect: { x: 0, y: 0, w: 1, h: 1 } }] },
          'W-2': { id: 'W-2', settings: { name: '2' }, layout: [{ id: 'L-2', widgetId: 'HIDDEN', rect: { x: 0, y: 0, w: 1, h: 1 } }] },
        },
      },
      ui: {
        appConfig: fixtureAppConfig({ aiAlwaysAllow: true }),
        memSaver: { activeWorkflows: [{ prjId: 'P', wflId: 'W-1' }] },
      },
    } as never);
    const [appStore] = await fixtureAppStore(state);
    let seenDuringRun: boolean | undefined;
    const show = makeAction({ run: jest.fn(() => {
      const s = appStore.get();
      appStore.set({ ...s, ui: { ...s.ui, memSaver: { ...s.ui.memSaver, activeWorkflows: [{ prjId: 'P', wflId: 'W-1' }, { prjId: 'P', wflId: 'W-2' }] } } });
      // A view can mount (and ask) while the write still runs.
      seenDuringRun = takeRevealedByAi('HIDDEN');
      return { ok: true, value: null } as const;
    }) });
    const { runAiRequestUseCase } = await setup([show], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1 }));
    expect(seenDuringRun).toBe(true);
    // It took its mark while the write ran: Restart Shell later starts the shell.
    expect(takeRevealedByAi('HIDDEN')).toBe(false);
    expect(takeRevealedByAi('SHOWN')).toBe(false);
  });

  it('with "always allow" on, refuses the write when a settings window opened while main answered', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    aiControl.alive.mockImplementationOnce(async () => {
      const s = appStore.get();
      appStore.set({ ...s, ui: { ...s.ui, modalScreens: { ...s.ui.modalScreens, order: ['applicationSettings'] } } });
      return true;
    });
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'not_ready' });
    expect(action.run).not.toHaveBeenCalled();
  });

  it('does not take ordinary text that starts with "File:" for a file URL', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction({ parse: (input) => input as { n: number } });
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1, text: 'File: budget.xlsx' }));
    expect(aiControl.confirm).not.toHaveBeenCalled();
    await runAiRequestUseCase(run('thing.do', { n: 1, text: 'file:///C:/x.png' }));
    await runAiRequestUseCase(run('thing.do', { n: 1, text: 'file:' + String.fromCharCode(92, 92) + 'host' }));
    expect(aiControl.confirm).toHaveBeenCalledTimes(2);
  });

  it('treats NT-namespace UNC paths and a bare host as paths to another computer', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction({ parse: (input) => input as { n: number } });
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    const b = String.fromCharCode(92);
    for (const path of [b + '??' + b + 'UNC' + b + 'host' + b + 's', b + b + 'host', '//host', b + b + b + 'host' + b + 's', '///host/s']) {
      await runAiRequestUseCase(run('thing.do', { n: 1, path }));
    }
    expect(aiControl.confirm).toHaveBeenCalledTimes(5);
  });

  it('asks after all when "always allow" was turned off while main answered', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const action = makeAction();
    const { aiControl, runAiRequestUseCase } = await setup([action], false, appStore);
    aiControl.alive.mockImplementationOnce(async () => {
      const s = appStore.get();
      appStore.set({ ...s, ui: { ...s.ui, appConfig: { ...s.ui.appConfig, aiAlwaysAllow: false } } });
      return true;
    });
    await expect(runAiRequestUseCase(run('thing.do', { n: 1 }))).resolves.toMatchObject({ ok: false, code: 'denied' });
    expect(aiControl.confirm).toHaveBeenCalledTimes(1);
    expect(action.run).not.toHaveBeenCalled();
  });

  it('marks only the newly shown widgets that run programs (a Terminal), not every widget', async () => {
    resetAiActivity();
    const state = fixtureAppState({
      entities: {
        widgetTypes: { term: { id: 'term', runsPrograms: true }, note: { id: 'note' } },
        widgets: { T: { id: 'T', type: 'term' }, N: { id: 'N', type: 'note' } },
        workflows: { 'W-2': { id: 'W-2', settings: { name: '2' }, layout: [
          { id: 'L-1', widgetId: 'T', rect: { x: 0, y: 0, w: 1, h: 1 } }, { id: 'L-2', widgetId: 'N', rect: { x: 0, y: 0, w: 1, h: 1 } },
        ] } },
      },
      ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }), memSaver: { activeWorkflows: [] } },
    } as never);
    const [appStore] = await fixtureAppStore(state);
    const show = makeAction({ run: jest.fn(() => {
      const s = appStore.get();
      appStore.set({ ...s, ui: { ...s.ui, memSaver: { ...s.ui.memSaver, activeWorkflows: [{ prjId: 'P', wflId: 'W-2' }] } } });
      return { ok: true, value: null } as const;
    }) });
    const { runAiRequestUseCase } = await setup([show], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1 }));
    expect(takeRevealedByAi('N')).toBe(false);
    expect(takeRevealedByAi('T')).toBe(true);
  });

  it('keeps only the latest marks (widgets that never mount do not pile up)', () => {
    resetAiActivity();
    markRevealedByAi(Array.from({ length: 300 }, (_, i) => `W${i}`));
    expect(takeRevealedByAi('W0')).toBe(false);
    expect(takeRevealedByAi('W299')).toBe(true);
  });

  it('tells the action whether the user allowed it in the box', async () => {
    const action = makeAction();
    const { runAiRequestUseCase } = await setup([action]);
    await runAiRequestUseCase(run('thing.do', { n: 1 }));
    expect(action.run).toHaveBeenLastCalledWith({ n: 1 }, { confirmed: true });
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const quiet = makeAction();
    const second = await setup([quiet], true, appStore);
    await second.runAiRequestUseCase(run('thing.do', { n: 2 }));
    expect(quiet.run).toHaveBeenLastCalledWith({ n: 2 }, { confirmed: false });
  });

  it('asks main about the request it was given (its id), also with "always allow" on', async () => {
    const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { appConfig: fixtureAppConfig({ aiAlwaysAllow: true }) } }));
    const { aiControl, runAiRequestUseCase } = await setup([makeAction()], false, appStore);
    await runAiRequestUseCase(run('thing.do', { n: 1 }));
    expect(aiControl.alive).toHaveBeenCalledWith(7);
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
    expect(action.run).toHaveBeenCalledWith({ n: 2 }, { confirmed: true });
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
