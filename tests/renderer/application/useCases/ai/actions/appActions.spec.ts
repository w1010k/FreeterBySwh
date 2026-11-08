/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createAppAiActions } from '@/application/useCases/ai/actions/appActions';
import { createCreateWorkflowSubCase } from '@/application/useCases/workflow/subs/createWorkflow';
import { createDeactivateWorkflowUseCase } from '@/application/useCases/memSaver/deactivateWorkflow';
import { createRenameWorkflowUseCase } from '@/application/useCases/workflowSwitcher/renameWorkflow';
import { AiAction } from '@/base/ai/aiAction';
import { AppState } from '@/base/state/app';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureProjectA, fixtureProjectB } from '@tests/base/fixtures/project';
import { fixtureProjectSwitcher } from '@tests/base/state/fixtures/projectSwitcher';
import { fixtureWorkflowA, fixtureWorkflowB, fixtureWorkflowC, fixtureWorkflowSettingsA, fixtureWorkflowSettingsB, fixtureWorkflowSettingsC } from '@tests/base/fixtures/workflow';
import { fixtureWidgetA, fixtureWidgetCoreSettingsA } from '@tests/base/fixtures/widget';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { fixtureWidgetTypeA } from '@tests/base/fixtures/widgetType';
import { fixtureMemSaver } from '@tests/base/state/fixtures/memSaver';

const newItemId = 'NEW-ITEM-ID';

function makeState(): AppState {
  const widgetType = fixtureWidgetTypeA({ name: 'Note', description: 'Notes' });
  const widget = fixtureWidgetA({ type: widgetType.id, coreSettings: fixtureWidgetCoreSettingsA({ name: '' }) });
  const workflowA = fixtureWorkflowA({ settings: fixtureWorkflowSettingsA({ name: 'Plan' }), layout: [fixtureWidgetLayoutItemA({ widgetId: widget.id })] });
  const workflowB = fixtureWorkflowB({ settings: fixtureWorkflowSettingsB({ name: 'Do' }), layout: [] });
  const workflowC = fixtureWorkflowC({ settings: fixtureWorkflowSettingsC({ name: 'Other' }), layout: [] });
  const projectA = fixtureProjectA({ workflowIds: [workflowA.id, workflowB.id], currentWorkflowId: workflowA.id });
  const projectB = fixtureProjectB({ workflowIds: [workflowC.id], currentWorkflowId: workflowC.id });
  return fixtureAppState({
    entities: {
      projects: { [projectA.id]: projectA, [projectB.id]: projectB },
      workflows: { [workflowA.id]: workflowA, [workflowB.id]: workflowB, [workflowC.id]: workflowC },
      widgets: { [widget.id]: widget },
      widgetTypes: { [widgetType.id]: widgetType },
    },
    ui: {
      projectSwitcher: fixtureProjectSwitcher({ projectIds: [projectA.id, projectB.id], currentProjectId: projectA.id })
    }
  });
}

async function setup(initState = makeState()) {
  const [appStore] = await fixtureAppStore(initState);
  const actions = createAppAiActions({
    appStore,
    createWorkflowSubCase: createCreateWorkflowSubCase({ idGenerator: () => newItemId }),
    deactivateWorkflowUseCase: createDeactivateWorkflowUseCase({ appStore }),
    renameWorkflowUseCase: createRenameWorkflowUseCase({ appStore }),
  });
  const get = (id: string) => actions.find(a => a.id === id) as AiAction;
  const exec = async (id: string, input: unknown) => {
    const action = get(id);
    const parsed = action.parse(input);
    if (parsed === undefined) {
      throw new Error('parse failed');
    }
    return action.run(parsed);
  };
  return { appStore, get, exec, initState };
}

describe('createAppAiActions()', () => {
  it('app.describe lists projects, workflows in order, widgets with display names and widget types', async () => {
    const { exec, initState } = await setup();
    const [projectAId, projectBId] = initState.ui.projectSwitcher.projectIds;
    const res = await exec('app.describe', {});
    expect(res).toEqual({
      ok: true,
      value: {
        currentProjectId: projectAId,
        projects: [{
          id: projectAId,
          name: initState.entities.projects[projectAId]!.settings.name,
          currentWorkflowId: fixtureWorkflowA().id,
          workflows: [
            { id: fixtureWorkflowA().id, name: 'Plan', widgets: [{ id: fixtureWidgetA().id, type: fixtureWidgetTypeA().id, name: 'Note' }] },
            { id: fixtureWorkflowB().id, name: 'Do', widgets: [] },
          ]
        }, {
          id: projectBId,
          name: initState.entities.projects[projectBId]!.settings.name,
          currentWorkflowId: fixtureWorkflowC().id,
          workflows: [{ id: fixtureWorkflowC().id, name: 'Other', widgets: [] }]
        }],
        widgetTypes: [{ id: fixtureWidgetTypeA().id, name: 'Note', description: 'Notes' }]
      }
    });
  });

  it('workflow.create adds to the given project, uses the given name, switches to it and returns the new id', async () => {
    const { exec, appStore } = await setup();
    const projectBId = fixtureProjectB().id;
    await expect(exec('workflow.create', { projectId: projectBId, name: 'New' })).resolves.toEqual({ ok: true, value: { workflowId: newItemId } });
    const state = appStore.get();
    expect(state.entities.workflows[newItemId]?.settings.name).toBe('New');
    expect(state.entities.projects[projectBId]?.workflowIds).toEqual([fixtureWorkflowC().id, newItemId]);
    expect(state.entities.projects[projectBId]?.currentWorkflowId).toBe(newItemId);
  });

  it('workflow.create without name generates a unique name', async () => {
    const { exec, appStore } = await setup();
    await exec('workflow.create', { projectId: fixtureProjectA().id });
    const name = appStore.get().entities.workflows[newItemId]?.settings.name;
    expect(name).toBeTruthy();
    expect(['Plan', 'Do']).not.toContain(name);
  });

  it('workflow.create returns not_found for an unknown project', async () => {
    const { exec } = await setup();
    await expect(exec('workflow.create', { projectId: 'NO-SUCH' })).resolves.toMatchObject({ ok: false, code: 'not_found' });
  });

  it('parse rejects missing ids and an empty workflow name', async () => {
    const { get } = await setup();
    expect(get('workflow.rename').parse({ workflowId: 'x', name: '' })).toBeUndefined();
    expect(get('workflow.rename').parse({ workflowId: 'x' })).toBeUndefined();
    expect(get('workflow.delete').parse({})).toBeUndefined();
    expect(get('project.switch').parse({ projectId: 5 })).toBeUndefined();
  });

  it('workflow.rename renames the workflow', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('workflow.rename', { workflowId: fixtureWorkflowB().id, name: 'Done' })).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get().entities.workflows[fixtureWorkflowB().id]?.settings.name).toBe('Done');
  });

  it('workflow.delete removes the workflow from its owner project', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('workflow.delete', { workflowId: fixtureWorkflowB().id })).resolves.toEqual({ ok: true, value: null });
    const state = appStore.get();
    expect(state.entities.workflows[fixtureWorkflowB().id]).toBeUndefined();
    expect(state.entities.projects[fixtureProjectA().id]?.workflowIds).toEqual([fixtureWorkflowA().id]);
  });

  it('workflow.delete returns not_found when the workflow was removed after confirm', async () => {
    const { get, appStore } = await setup();
    const action = get('workflow.delete');
    const input = action.parse({ workflowId: fixtureWorkflowB().id });
    const state = appStore.get();
    const { [fixtureWorkflowB().id]: _removed, ...workflows } = state.entities.workflows;
    appStore.set({ ...state, entities: { ...state.entities, workflows } });
    await expect(Promise.resolve(action.run(input))).resolves.toMatchObject({ ok: false, code: 'not_found' });
  });

  it('workflow.switch switches project and workflow', async () => {
    const { exec, appStore } = await setup();
    await exec('workflow.switch', { workflowId: fixtureWorkflowC().id });
    expect(appStore.get().ui.projectSwitcher.currentProjectId).toBe(fixtureProjectB().id);
    await exec('workflow.switch', { workflowId: fixtureWorkflowB().id });
    const state = appStore.get();
    expect(state.ui.projectSwitcher.currentProjectId).toBe(fixtureProjectA().id);
    expect(state.entities.projects[fixtureProjectA().id]?.currentWorkflowId).toBe(fixtureWorkflowB().id);
  });

  it('project.switch switches the current project and returns not_found for an unknown one', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('project.switch', { projectId: fixtureProjectB().id })).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get().ui.projectSwitcher.currentProjectId).toBe(fixtureProjectB().id);
    await expect(exec('project.switch', { projectId: 'NO-SUCH' })).resolves.toMatchObject({ ok: false, code: 'not_found' });
  });

  it('describes write actions for the confirm dialog', async () => {
    const { get, initState } = await setup();
    const projectAName = initState.entities.projects[fixtureProjectA().id]!.settings.name;
    const projectBName = initState.entities.projects[fixtureProjectB().id]!.settings.name;
    const d = (id: string, input: unknown) => get(id).describe(get(id).parse(input));
    expect(d('project.switch', { projectId: fixtureProjectB().id })).toBe(`Switch to project "${projectBName}"`);
    expect(d('workflow.create', { projectId: fixtureProjectA().id, name: 'X' })).toBe(`Create workflow "X" in project "${projectAName}"`);
    expect(d('workflow.rename', { workflowId: fixtureWorkflowA().id, name: 'Y' })).toBe('Rename workflow "Plan" to "Y"');
    expect(d('workflow.delete', { workflowId: fixtureWorkflowA().id })).toBe('Delete workflow "Plan"');
    expect(d('workflow.switch', { workflowId: fixtureWorkflowA().id })).toBe('Switch to workflow "Plan"');
    expect(d('workflow.delete', { workflowId: 'NO-SUCH' })).toBe('Delete workflow "NO-SUCH"');
  });
});

describe('workflow.switch and Memory Saver', () => {
  it('makes the workflow current before switching project, so the project\'s previous workflow is not loaded', async () => {
    const wfA = fixtureWorkflowA({ layout: [] });
    const wfB = fixtureWorkflowB({ layout: [] });
    const wfC = fixtureWorkflowC({ layout: [] });
    const projectA = fixtureProjectA({ workflowIds: [wfA.id], currentWorkflowId: wfA.id });
    const projectB = fixtureProjectB({ workflowIds: [wfB.id, wfC.id], currentWorkflowId: wfB.id });
    const base = fixtureAppState({
      entities: {
        projects: { [projectA.id]: projectA, [projectB.id]: projectB },
        workflows: { [wfA.id]: wfA, [wfB.id]: wfB, [wfC.id]: wfC },
      },
      ui: {
        projectSwitcher: fixtureProjectSwitcher({ projectIds: [projectA.id, projectB.id], currentProjectId: projectA.id }),
        memSaver: fixtureMemSaver({ activeWorkflows: [{ prjId: projectA.id, wflId: wfA.id }] })
      }
    });
    const state = {
      ...base,
      ui: { ...base.ui, appConfig: { ...base.ui.appConfig, memSaver: { activateWorkflowsOnProjectSwitch: false, workflowInactiveAfter: -1 } } }
    };
    const { exec, appStore } = await setup(state);
    await exec('workflow.switch', { workflowId: wfC.id });
    const active = appStore.get().ui.memSaver.activeWorkflows.map(w => w.wflId);
    expect(active).toContain(wfC.id);
    expect(active).not.toContain(wfB.id);
  });
});
