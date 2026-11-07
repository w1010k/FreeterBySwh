/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createWidgetTypeAiActions } from '@/application/useCases/ai/actions/widgetTypeActions';
import { WidgetAiAction } from '@/base/ai/widgetAiAction';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureWidgetA, fixtureWidgetB, fixtureWidgetCoreSettingsA } from '@tests/base/fixtures/widget';
import { fixtureWidgetTypeA, fixtureWidgetTypeB } from '@tests/base/fixtures/widgetType';

const addItem: WidgetAiAction<{ text: string }> = {
  name: 'addItem',
  description: 'Add an item',
  kind: 'write',
  properties: { text: { type: 'string' } },
  required: ['text'],
  parse: (input) => (typeof input.text === 'string' ? { text: input.text } : undefined),
  describe: ({ text }, widgetName) => `Add "${text}" to "${widgetName}"`,
  run: ({ api, settings }, { text }) => ({ ok: true, value: { added: (api.add as (t: string) => string)(text), settings } }),
};

async function setup(exposedApi?: object) {
  const typeA = fixtureWidgetTypeA({ id: 'todo', name: 'To-Do', aiActions: [addItem] });
  const typeB = fixtureWidgetTypeB();
  const widget = fixtureWidgetA({ type: typeA.id, settings: { s: 1 }, coreSettings: fixtureWidgetCoreSettingsA({ name: 'Tasks' }), exposedApi });
  const other = fixtureWidgetB({ type: typeB.id });
  const [appStore] = await fixtureAppStore(fixtureAppState({
    entities: { widgets: { [widget.id]: widget, [other.id]: other }, widgetTypes: { [typeA.id]: typeA, [typeB.id]: typeB } }
  }));
  const actions = createWidgetTypeAiActions({ appStore, widgetTypes: [typeA, typeB] });
  return { actions, widget, other };
}

describe('createWidgetTypeAiActions()', () => {
  it('exposes each declared action as "<type>.<name>" with widgetId in the schema', async () => {
    const { actions } = await setup();
    expect(actions.map(a => a.id)).toEqual(['todo.addItem']);
    expect(actions[0]).toMatchObject({
      kind: 'write',
      inputSchema: { type: 'object', properties: { widgetId: { type: 'string', minLength: 1 }, text: { type: 'string' } }, required: ['widgetId', 'text'] }
    });
  });

  it('parse needs a widgetId and the action input', async () => {
    const { actions } = await setup();
    expect(actions[0].parse({ text: 'x' })).toBeUndefined();
    expect(actions[0].parse({ widgetId: 'w', text: 3 })).toBeUndefined();
    expect(actions[0].parse({ widgetId: 'w', text: 'x' })).toEqual({ widgetId: 'w', input: { text: 'x' } });
  });

  it('runs through the mounted widget\'s exposed api with its settings', async () => {
    const { actions, widget } = await setup({ add: (t: string) => `+${t}` });
    const input = actions[0].parse({ widgetId: widget.id, text: 'milk' });
    await expect(Promise.resolve(actions[0].run(input))).resolves.toEqual({ ok: true, value: { added: '+milk', settings: { s: 1 } } });
    expect(actions[0].describe(input)).toBe('Add "milk" to "Tasks"');
  });

  it('returns not_ready when the widget is not mounted (no exposed api)', async () => {
    const { actions, widget } = await setup();
    const input = actions[0].parse({ widgetId: widget.id, text: 'milk' });
    await expect(Promise.resolve(actions[0].run(input))).resolves.toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('returns not_found for an unknown widget or a widget of another type', async () => {
    const { actions, other } = await setup({ add: () => '' });
    await expect(Promise.resolve(actions[0].run(actions[0].parse({ widgetId: 'NO', text: 'x' })))).resolves.toMatchObject({ code: 'not_found' });
    await expect(Promise.resolve(actions[0].run(actions[0].parse({ widgetId: other.id, text: 'x' })))).resolves.toMatchObject({ code: 'not_found' });
  });
});
