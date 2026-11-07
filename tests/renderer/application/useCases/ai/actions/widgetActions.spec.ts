/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createWidgetAiActions } from '@/application/useCases/ai/actions/widgetActions';
import { createCreateWidgetSubCase } from '@/application/useCases/widget/subs/createWidget';
import { createAddItemToWidgetLayoutSubCase } from '@/application/useCases/workflow/subs/addItemToWidgetLayout';
import { AiAction } from '@/base/ai/aiAction';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureWorkflowA, fixtureWorkflowB, fixtureWorkflowSettingsA, fixtureWorkflowSettingsB } from '@tests/base/fixtures/workflow';
import { fixtureWidgetA, fixtureWidgetB, fixtureWidgetCoreSettingsA } from '@tests/base/fixtures/widget';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { fixtureWidgetTypeA } from '@tests/base/fixtures/widgetType';
import { fixtureShelf } from '@tests/base/state/fixtures/shelf';
import { fixtureWidgetListItemA } from '@tests/base/fixtures/widgetList';

const newId = 'NEW-ID';

function makeState() {
  const widgetType = fixtureWidgetTypeA({ name: 'Note' });
  const widget = fixtureWidgetA({ type: widgetType.id, coreSettings: fixtureWidgetCoreSettingsA({ name: 'Ideas' }) });
  const shelfWidget = fixtureWidgetB({ type: widgetType.id });
  const workflow = fixtureWorkflowA({ settings: fixtureWorkflowSettingsA({ name: 'Plan' }), layout: [fixtureWidgetLayoutItemA({ widgetId: widget.id })] });
  return fixtureAppState({
    entities: {
      workflows: { [workflow.id]: workflow },
      widgets: { [widget.id]: widget, [shelfWidget.id]: shelfWidget },
      widgetTypes: { [widgetType.id]: widgetType },
    },
    ui: {
      shelf: fixtureShelf({ widgetList: [fixtureWidgetListItemA({ widgetId: shelfWidget.id })] }),
      widgetDynamicTitles: { [widget.id]: 'dyn' }
    }
  });
}

async function setup() {
  const [appStore] = await fixtureAppStore(makeState());
  const actions = createWidgetAiActions({
    appStore,
    createWidgetSubCase: createCreateWidgetSubCase({ idGenerator: () => newId }),
    addItemToWidgetLayoutSubCase: createAddItemToWidgetLayoutSubCase({ idGenerator: () => 'NEW-LAYOUT-ID' }),
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

describe('createWidgetAiActions()', () => {
  it('widget.add creates the widget in the workflow layout and returns its id', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('widget.add', { workflowId: fixtureWorkflowA().id, widgetTypeId: fixtureWidgetTypeA().id, name: 'Todo' }))
      .resolves.toEqual({ ok: true, value: { widgetId: newId } });
    const state = appStore.get();
    expect(state.entities.widgets[newId]).toMatchObject({ type: fixtureWidgetTypeA().id, coreSettings: { name: 'Todo' } });
    expect(state.entities.workflows[fixtureWorkflowA().id]?.layout.map(i => i.widgetId)).toEqual([fixtureWidgetA().id, newId]);
  });

  it('widget.add returns not_found for an unknown widget type or workflow', async () => {
    const { exec } = await setup();
    await expect(exec('widget.add', { workflowId: 'NO', widgetTypeId: fixtureWidgetTypeA().id })).resolves.toMatchObject({ code: 'not_found' });
    await expect(exec('widget.add', { workflowId: fixtureWorkflowA().id, widgetTypeId: 'NO' })).resolves.toMatchObject({ code: 'not_found' });
  });

  it('widget.rename updates coreSettings.name and allows an empty name', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('widget.rename', { widgetId: fixtureWidgetA().id, name: '' })).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get().entities.widgets[fixtureWidgetA().id]?.coreSettings.name).toBe('');
  });

  it('widget.delete removes widget, layout item and dynamic title', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('widget.delete', { widgetId: fixtureWidgetA().id })).resolves.toEqual({ ok: true, value: null });
    const state = appStore.get();
    expect(state.entities.widgets[fixtureWidgetA().id]).toBeUndefined();
    expect(state.entities.workflows[fixtureWorkflowA().id]?.layout).toEqual([]);
    expect(state.ui.widgetDynamicTitles).toEqual({});
  });

  it('widget.delete returns not_found for a shelf widget', async () => {
    const { exec, appStore } = await setup();
    await expect(exec('widget.delete', { widgetId: fixtureWidgetB().id })).resolves.toMatchObject({ code: 'not_found' });
    expect(appStore.get().entities.widgets[fixtureWidgetB().id]).toBeDefined();
  });

  it('describes write actions for the confirm dialog', async () => {
    const { get } = await setup();
    const d = (id: string, input: unknown) => get(id).describe(get(id).parse(input));
    expect(d('widget.add', { workflowId: fixtureWorkflowA().id, widgetTypeId: fixtureWidgetTypeA().id })).toBe('Add a Note widget to workflow "Plan"');
    expect(d('widget.rename', { widgetId: fixtureWidgetA().id, name: 'X' })).toBe('Rename widget "Ideas" to "X"');
    expect(d('widget.delete', { widgetId: fixtureWidgetA().id })).toBe('Delete widget "Ideas"');
  });
});

describe('createWidgetAiActions() settings and move', () => {
  async function setup2() {
    const widgetType = fixtureWidgetTypeA({ name: 'Note', createSettingsState: s => ({ size: typeof s.size === 'number' ? s.size : 10 }) });
    const widget = fixtureWidgetA({ type: widgetType.id, settings: { size: 12 }, coreSettings: fixtureWidgetCoreSettingsA({ name: 'Ideas' }) });
    const shelfWidget = fixtureWidgetB({ type: widgetType.id, settings: { size: 1 } });
    const from = fixtureWorkflowA({ settings: fixtureWorkflowSettingsA({ name: 'Plan' }), layout: [fixtureWidgetLayoutItemA({ widgetId: widget.id })] });
    const to = fixtureWorkflowB({ settings: fixtureWorkflowSettingsB({ name: 'Do' }), layout: [] });
    const [appStore] = await fixtureAppStore(fixtureAppState({
      entities: {
        workflows: { [from.id]: from, [to.id]: to },
        widgets: { [widget.id]: widget, [shelfWidget.id]: shelfWidget },
        widgetTypes: { [widgetType.id]: widgetType },
      },
      ui: { shelf: fixtureShelf({ widgetList: [fixtureWidgetListItemA({ widgetId: shelfWidget.id })] }) }
    }));
    const actions = createWidgetAiActions({
      appStore,
      createWidgetSubCase: createCreateWidgetSubCase({ idGenerator: () => newId }),
      addItemToWidgetLayoutSubCase: createAddItemToWidgetLayoutSubCase({ idGenerator: () => 'NEW-LAYOUT-ID' }),
    });
    const get = (id: string) => actions.find(a => a.id === id) as AiAction;
    const exec = async (id: string, input: unknown) => {
      const parsed = get(id).parse(input);
      if (parsed === undefined) {
        throw new Error('parse failed');
      }
      return get(id).run(parsed);
    };
    return { appStore, get, exec, widget, shelfWidget, from, to };
  }

  it('widget.get returns the widget with its workflow, and null workflowId for a shelf widget', async () => {
    const { exec, widget, shelfWidget, from } = await setup2();
    await expect(exec('widget.get', { widgetId: widget.id })).resolves.toEqual({
      ok: true, value: { id: widget.id, type: widget.type, name: 'Ideas', settings: { size: 12 }, workflowId: from.id }
    });
    await expect(exec('widget.get', { widgetId: shelfWidget.id })).resolves.toMatchObject({ ok: true, value: { workflowId: null } });
    await expect(exec('widget.get', { widgetId: 'NO' })).resolves.toMatchObject({ code: 'not_found' });
  });

  it('widget.updateSettings merges and lets the widget type sanitize the result', async () => {
    const { exec, appStore, widget } = await setup2();
    await expect(exec('widget.updateSettings', { widgetId: widget.id, settings: { size: 20 } })).resolves.toEqual({ ok: true, value: { settings: { size: 20 } } });
    await exec('widget.updateSettings', { widgetId: widget.id, settings: { size: 'big', extra: 1 } });
    expect(appStore.get().entities.widgets[widget.id]?.settings).toEqual({ size: 10 });
  });

  it('widget.updateSettings parse requires a settings object', async () => {
    const { get } = await setup2();
    expect(get('widget.updateSettings').parse({ widgetId: 'x', settings: [1] })).toBeUndefined();
    expect(get('widget.updateSettings').parse({ widgetId: 'x' })).toBeUndefined();
  });

  it('widget.move moves the layout item to another workflow', async () => {
    const { exec, appStore, widget, from, to } = await setup2();
    await expect(exec('widget.move', { widgetId: widget.id, toWorkflowId: to.id })).resolves.toEqual({ ok: true, value: null });
    const state = appStore.get();
    expect(state.entities.workflows[from.id]?.layout).toEqual([]);
    expect(state.entities.workflows[to.id]?.layout.map(i => i.widgetId)).toEqual([widget.id]);
    expect(state.entities.widgets[widget.id]).toBeDefined();
  });

  it('widget.move to its own workflow changes nothing', async () => {
    const { exec, appStore, widget, from } = await setup2();
    const before = appStore.get();
    await expect(exec('widget.move', { widgetId: widget.id, toWorkflowId: from.id })).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get()).toBe(before);
  });

  it('widget.move returns not_found for an unknown target or a shelf widget', async () => {
    const { exec, widget, shelfWidget, to } = await setup2();
    await expect(exec('widget.move', { widgetId: widget.id, toWorkflowId: 'NO' })).resolves.toMatchObject({ code: 'not_found' });
    await expect(exec('widget.move', { widgetId: shelfWidget.id, toWorkflowId: to.id })).resolves.toMatchObject({ code: 'not_found' });
  });

  it('describes settings and move for the confirm dialog', async () => {
    const { get, widget, to } = await setup2();
    const d = (id: string, input: unknown) => get(id).describe(get(id).parse(input));
    expect(d('widget.updateSettings', { widgetId: widget.id, settings: { size: 1, a: 'x' } })).toBe('Change settings of widget "Ideas": {"size":1,"a":"x"}');
    // The values are what the user approves (e.g. a script injected into web pages), so long ones are cut, not hidden.
    const long = d('widget.updateSettings', { widgetId: widget.id, settings: { injectedJS: 'y'.repeat(1000) } });
    expect(long.startsWith('Change settings of widget "Ideas": {"injectedJS":"yyy')).toBe(true);
    expect(long.endsWith('... (1017 characters)')).toBe(true);
    expect(d('widget.move', { widgetId: widget.id, toWorkflowId: to.id })).toBe('Move widget "Ideas" to workflow "Do"');
  });
});
