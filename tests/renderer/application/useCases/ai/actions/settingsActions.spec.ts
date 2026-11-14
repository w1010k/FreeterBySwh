/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsAiActions } from '@/application/useCases/ai/actions/settingsActions';
import { AiAction } from '@/base/ai/aiAction';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup() {
  const [appStore] = await fixtureAppStore(fixtureAppState({}));
  const actions = createSettingsAiActions({ appStore });
  const get = (id: string) => actions.find(a => a.id === id) as AiAction;
  return { appStore, get };
}

describe('createSettingsAiActions()', () => {
  it('app.getSettings returns only the editable keys', async () => {
    const { get, appStore } = await setup();
    const c = appStore.get().ui.appConfig;
    await expect(Promise.resolve(get('app.getSettings').run({}))).resolves.toEqual({
      ok: true,
      value: {
        uiTheme: c.uiTheme, bgColor: c.bgColor, bgImage: c.bgImage, bgImageMode: c.bgImageMode, bgOpacity: c.bgOpacity,
        workflowBarPos: c.workflowBarPos, workflowBarWidth: c.workflowBarWidth, mergeTopBar: c.mergeTopBar, downloadDir: c.downloadDir
      }
    });
  });

  it('app.updateSettings changes the given keys only', async () => {
    const { get, appStore } = await setup();
    const before = appStore.get().ui.appConfig;
    const action = get('app.updateSettings');
    await expect(Promise.resolve(action.run(action.parse({ workflowBarPos: 'top', bgOpacity: 40, uiTheme: 'light' })))).resolves.toEqual({ ok: true, value: null });
    expect(appStore.get().ui.appConfig).toEqual({ ...before, workflowBarPos: 'top', bgOpacity: 40, uiTheme: 'light' });
  });

  it('parse rejects unknown or protected keys, values outside enums and out-of-range numbers', async () => {
    const { get } = await setup();
    const parse = get('app.updateSettings').parse;
    expect(parse({ telemetry: { enabled: true } })).toBeUndefined();
    expect(parse({ mainHotkey: 'X' })).toBeUndefined();
    expect(parse({ nope: 1 })).toBeUndefined();
    expect(parse({ workflowBarPos: 'middle' })).toBeUndefined();
    expect(parse({ uiTheme: 'pink' })).toBeUndefined();
    expect(parse({ bgOpacity: 101 })).toBeUndefined();
    expect(parse({ bgOpacity: 1.5 })).toBeUndefined();
    expect(parse({ workflowBarWidth: 0 })).toBeUndefined();
    // Same bounds as the settings window and the bar's drag handle.
    expect(parse({ workflowBarWidth: 119 })).toBeUndefined();
    expect(parse({ workflowBarWidth: 601 })).toBeUndefined();
    expect(parse({ workflowBarWidth: 300 })).toEqual({ workflowBarWidth: 300 });
    expect(parse({ mergeTopBar: 'yes' })).toBeUndefined();
    expect(parse({ mergeTopBar: true })).toEqual({ mergeTopBar: true });
    expect(parse({ bgColor: 3 })).toBeUndefined();
    expect(parse({})).toBeUndefined();
    expect(parse({ bgImageMode: 'tile', downloadDir: 'D:\\dl' })).toEqual({ bgImageMode: 'tile', downloadDir: 'D:\\dl' });
  });

  it('app.updateSettings always asks when it changes the download folder (downloads save there without asking)', async () => {
    const { get } = await setup();
    const update = get('app.updateSettings');
    expect(update.alwaysConfirm?.({ uiTheme: 'dark' }) ?? false).toBe(false);
    expect(update.alwaysConfirm?.({ downloadDir: 'C:/x' })).toBe(true);
  });

  it('describes the change for the confirm dialog', async () => {
    const { get } = await setup();
    const action = get('app.updateSettings');
    expect(action.describe(action.parse({ bgColor: '#000', bgOpacity: 10 }))).toBe('Change app settings: bgColor = "#000"; bgOpacity = 10');
  });
});
