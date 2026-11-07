/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createProjectAiActions } from '@/application/useCases/ai/actions/projectActions';
import { createCreateWorkflowSubCase } from '@/application/useCases/workflow/subs/createWorkflow';
import { createDeactivateWorkflowUseCase } from '@/application/useCases/memSaver/deactivateWorkflow';
import { AiAction } from '@/base/ai/aiAction';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureProjectA, fixtureProjectB, fixtureProjectSettingsA, fixtureProjectSettingsB } from '@tests/base/fixtures/project';
import { fixtureProjectSwitcher } from '@tests/base/state/fixtures/projectSwitcher';
import { fixtureWorkflowA, fixtureWorkflowB } from '@tests/base/fixtures/workflow';
import { fixtureWidgetA } from '@tests/base/fixtures/widget';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { fixtureMemSaver } from '@tests/base/state/fixtures/memSaver';

function makeState(withB = true) {
  const widget = fixtureWidgetA();
  const workflowA = fixtureWorkflowA({ layout: [fixtureWidgetLayoutItemA({ widgetId: widget.id })] });
  const workflowB = fixtureWorkflowB({ layout: [] });
  const projectA = fixtureProjectA({ settings: fixtureProjectSettingsA({ name: 'Work' }), workflowIds: [workflowA.id], currentWorkflowId: workflowA.id });
  const projectB = fixtureProjectB({ settings: fixtureProjectSettingsB({ name: 'Home' }), workflowIds: [workflowB.id], currentWorkflowId: workflowB.id });
  return fixtureAppState({
    entities: {
      projects: withB ? { [projectA.id]: projectA, [projectB.id]: projectB } : { [projectA.id]: projectA },
      workflows: withB ? { [workflowA.id]: workflowA, [workflowB.id]: workflowB } : { [workflowA.id]: workflowA },
      widgets: { [widget.id]: widget },
    },
    ui: {
      projectSwitcher: fixtureProjectSwitcher({ projectIds: withB ? [projectA.id, projectB.id] : [projectA.id], currentProjectId: projectA.id }),
      memSaver: fixtureMemSaver({ activeWorkflows: [{ prjId: projectA.id, wflId: workflowA.id }] })
    }
  });
}

async function setup(state = makeState()) {
  const [appStore] = await fixtureAppStore(state);
  let n = 0;
  const actions = createProjectAiActions({
    appStore,
    idGenerator: () => `NEW-${++n}`,
    createWorkflowSubCase: createCreateWorkflowSubCase({ idGenerator: () => `NEW-WF-${++n}` }),
    deactivateWorkflowUseCase: createDeactivateWorkflowUseCase({ appStore }),
  });
  const get = (id: string) => actions.find(a => a.id === id) as AiAction;
  const exec = async (id: string, input: unknown) => {
    const parsed = get(id).parse(input);
    if (parsed === undefined) {
      throw new Error('parse failed');
    }
    return get(id).run(parsed);
  };
  return { appStore, get, exec };
}

describe('createProjectAiActions()', () => {
  it('project.create appends a project with one workflow and keeps the current project', async () => {
    const { exec, appStore } = await setup();
    const res = await exec('project.create', { name: 'Side' });
    expect(res).toEqual({ ok: true, value: { projectId: 'NEW-1', workflowId: 'NEW-WF-2' } });
    const state = appStore.get();
    expect(state.ui.projectSwitcher.projectIds).toEqual([fixtureProjectA().id, fixtureProjectB().id, 'NEW-1']);
    expect(state.ui.projectSwitcher.currentProjectId).toBe(fixtureProjectA().id);
    expect(state.entities.projects['NEW-1']).toMatchObject({ settings: { name: 'Side' }, workflowIds: ['NEW-WF-2'], currentWorkflowId: 'NEW-WF-2' });
    expect(state.entities.workflows['NEW-WF-2']).toBeDefined();
  });

  it('project.create without name generates a unique one', async () => {
    const { exec, appStore } = await setup();
    await exec('project.create', {});
    const name = appStore.get().entities.projects['NEW-1']?.settings.name;
    expect(name).toBeTruthy();
    expect(['Work', 'Home']).not.toContain(name);
  });

  it('project.rename renames, and parse rejects an empty name', async () => {
    const { exec, get, appStore } = await setup();
    await expect(exec('project.rename', { projectId: fixtureProjectB().id, name: 'Family' })).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get().entities.projects[fixtureProjectB().id]?.settings.name).toBe('Family');
    expect(get('project.rename').parse({ projectId: 'x', name: ' ' })).toBeUndefined();
  });

  it('project.delete removes the current project, its workflows and widgets, and switches to the next one', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('project.delete', { projectId: fixtureProjectA().id })).resolves.toEqual({ ok: true, value: null });
    const state = appStore.get();
    expect(state.ui.projectSwitcher.projectIds).toEqual([fixtureProjectB().id]);
    expect(state.ui.projectSwitcher.currentProjectId).toBe(fixtureProjectB().id);
    expect(state.entities.projects[fixtureProjectA().id]).toBeUndefined();
    expect(state.entities.workflows[fixtureWorkflowA().id]).toBeUndefined();
    expect(state.entities.widgets[fixtureWidgetA().id]).toBeUndefined();
    expect(state.ui.memSaver.activeWorkflows.map(w => w.wflId)).not.toContain(fixtureWorkflowA().id);
  });

  it('project.delete refuses the last project', async () => {
    const { exec, appStore } = await setup(makeState(false));
    await expect(exec('project.delete', { projectId: fixtureProjectA().id })).resolves.toMatchObject({ ok: false, code: 'invalid_input' });
    expect(appStore.get().entities.projects[fixtureProjectA().id]).toBeDefined();
  });

  it('returns not_found for unknown projects', async () => {
    const { exec } = await setup();
    await expect(exec('project.rename', { projectId: 'NO', name: 'x' })).resolves.toMatchObject({ code: 'not_found' });
    await expect(exec('project.delete', { projectId: 'NO' })).resolves.toMatchObject({ code: 'not_found' });
  });

  it('describes write actions for the confirm dialog', async () => {
    const { get } = await setup();
    const d = (id: string, input: unknown) => get(id).describe(get(id).parse(input));
    expect(d('project.create', { name: 'Side' })).toBe('Create project "Side"');
    expect(d('project.create', {})).toBe('Create project "(default name)"');
    expect(d('project.rename', { projectId: fixtureProjectA().id, name: 'X' })).toBe('Rename project "Work" to "X"');
    expect(d('project.delete', { projectId: fixtureProjectA().id })).toBe('Delete project "Work" and all its workflows');
  });
});
