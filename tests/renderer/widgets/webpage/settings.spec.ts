/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp } from '@/widgets/webpage/settings';
import { actionPresets } from '@/widgets/webpage/actionPresets';
import { act, screen } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut'
import { fixtureSettings } from './fixtures';

jest.useFakeTimers()

describe('Webpage Widget Settings', () => {
  it('should fill inputs with right values', () => {
    const settings = fixtureSettings({ url: 'https://www.url.com/', sessionScope: 'wgt', sessionPersist: 'temp', autoReload: 3600 });
    setupSettingsSut(settingsEditorComp, settings);

    expect(screen.getByRole('textbox', { name: /url/i })).toHaveValue(settings.url);
    expect(screen.getByRole('combobox', { name: /session scope/i })).toHaveValue(settings.sessionScope);
    expect(screen.getByRole('combobox', { name: /session persistence/i })).toHaveValue(settings.sessionPersist);
    expect(screen.getByRole('combobox', { name: /Auto-Reload/i })).toHaveValue(settings.autoReload.toString());
  })

  it('should allow to update "sessionScope" setting with an option select', async () => {
    const settings = fixtureSettings({ sessionScope: 'wgt' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const select = screen.getByRole('combobox', { name: /session scope/i })

    await user.selectOptions(select, 'wfl');

    expect(getSettings()).toEqual({
      ...settings,
      sessionScope: 'wfl'
    });
  })

  it('should allow to update "sessionPersist" setting with an option select', async () => {
    const settings = fixtureSettings({ sessionPersist: 'persist' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const select = screen.getByRole('combobox', { name: /session persistence/i })

    await user.selectOptions(select, 'temp');

    expect(getSettings()).toEqual({
      ...settings,
      sessionPersist: 'temp'
    });
  })

  it('should allow to update "autoReload" setting with an option select', async () => {
    const settings = fixtureSettings({ autoReload: 10 });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const select = screen.getByRole('combobox', { name: /Auto-Reload/i })

    await user.selectOptions(select, '0');

    expect(getSettings()).toEqual({
      ...settings,
      autoReload: 0
    });

    await user.selectOptions(select, '300');

    expect(getSettings()).toEqual({
      ...settings,
      autoReload: 300
    });
  })

  it('should allow to update "url" setting with a debounced (3s) text input', async () => {
    const url1 = 'https:';
    const url2 = '//url';
    const url3 = '.com'
    const settings = fixtureSettings({ url: '' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /url/i })

    await user.type(input, url1);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, url2);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, url3);

    act(() => jest.advanceTimersByTime(3000));
    expect(getSettings()).toEqual({
      ...settings,
      url: url1 + url2 + url3
    });
  })
  it('should immediately update "url" setting on input blur', async () => {
    const url = 'https://url.com';
    const settings = fixtureSettings({ url: '' });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /url/i })

    await user.type(input, url);
    expect(getSettings()).toEqual(settings);

    fireEvent.blur(input);
    expect(getSettings()).toEqual({
      ...settings,
      url
    });
  })

  it('should fill a url and a name input per tab', () => {
    const settings = fixtureSettings({ tabs: [{ url: 'https://a/', name: 'A' }, { url: 'https://b/', name: '' }] });
    setupSettingsSut(settingsEditorComp, settings);

    const urlInputs = screen.getAllByRole('textbox', { name: /tab url/i });
    expect(urlInputs[0]).toHaveValue('https://a/');
    expect(urlInputs[1]).toHaveValue('https://b/');
    expect(screen.getByRole('textbox', { name: /tab name 1/i })).toHaveValue('A');
    expect(screen.getByRole('textbox', { name: /tab name 2/i })).toHaveValue('');
  })

  it('should add and delete tab rows, updating the setting immediately', async () => {
    const settings = fixtureSettings({ tabs: [{ url: 'https://a/', name: '' }] });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /add tab/i }));
    expect(getSettings()).toEqual({
      ...settings,
      tabs: [{ url: 'https://a/', name: '' }, { url: '', name: '' }]
    });

    await user.click(screen.getAllByRole('button', { name: /delete tab/i })[0]);
    expect(getSettings()).toEqual({
      ...settings,
      tabs: [{ url: '', name: '' }]
    });
  })

  it('should move tab rows up and down, updating the setting immediately', async () => {
    const a = { url: 'https://a/', name: 'A' };
    const b = { url: 'https://b/', name: '' };
    const c = { url: 'https://c/', name: 'C' };
    const settings = fixtureSettings({ tabs: [a, b, c] });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getAllByRole('button', { name: /move down/i })[0]);
    expect(getSettings()).toEqual({ ...settings, tabs: [b, a, c] });

    await user.click(screen.getAllByRole('button', { name: /move up/i })[2]);
    expect(getSettings()).toEqual({ ...settings, tabs: [b, c, a] });
  })

  it('should update a tab url and name on blur', async () => {
    const settings = fixtureSettings({ tabs: [{ url: '', name: '' }] });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const urlInput = screen.getAllByRole('textbox', { name: /tab url/i })[0];
    const nameInput = screen.getByRole('textbox', { name: /tab name 1/i });

    await user.type(urlInput, 'https://a/');
    expect(getSettings()).toEqual(settings);
    fireEvent.blur(urlInput);
    expect(getSettings()).toEqual({ ...settings, tabs: [{ url: 'https://a/', name: '' }] });

    await user.type(nameInput, 'My Tab');
    fireEvent.blur(nameInput);
    expect(getSettings()).toEqual({ ...settings, tabs: [{ url: 'https://a/', name: 'My Tab' }] });
  })

  it('should update the "urlName" setting on blur of the tab name input next to the url', async () => {
    const settings = fixtureSettings({ urlName: '' });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /^tab name$/i });

    await user.type(input, 'First');
    expect(getSettings()).toEqual(settings);

    fireEvent.blur(input);
    expect(getSettings()).toEqual({ ...settings, urlName: 'First' });
  })

  it('should add, edit (on blur) and delete custom action rows', async () => {
    const settings = fixtureSettings({ customActions: [] });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /add action/i }));
    expect(getSettings()).toEqual({ ...settings, customActions: [{ id: expect.any(String), name: '', js: '' }] });
    const { id } = getSettings().customActions[0];

    const jsInput = screen.getByRole('textbox', { name: /action js 1/i });
    await user.type(jsInput, 'doStuff()');
    fireEvent.blur(jsInput);
    expect(getSettings()).toEqual({ ...settings, customActions: [{ id, name: '', js: 'doStuff()' }] });

    await user.click(screen.getByRole('button', { name: /delete action/i }));
    expect(getSettings()).toEqual({ ...settings, customActions: [] });
  })

  it('should list the built-in actions with custom actions between Translate and Mute', () => {
    const settings = fixtureSettings({ customActions: [{ id: 'a1', name: 'Mine', js: 'x()' }] });
    setupSettingsSut(settingsEditorComp, settings);

    const showBoxes = screen.getAllByRole('checkbox');
    expect(showBoxes).toHaveLength(13);
    expect(showBoxes.every(box => (box as HTMLInputElement).checked)).toBe(true);
    const names = showBoxes.map(box => box.getAttribute('aria-label') ?? box.parentElement!.textContent!.trim());
    expect(names.indexOf('Show Action 1')).toBe(names.indexOf('Translate to Korean') + 1);
    expect(names.indexOf('Mute or unmute audio')).toBe(names.indexOf('Show Action 1') + 1);
  })

  it('should hide and show a button with its checkbox', async () => {
    const settings = fixtureSettings({});
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('checkbox', { name: /go back/i }));
    expect(getSettings().actionBar).toEqual({ hidden: ['BACK'], order: [] });

    await user.click(screen.getByRole('checkbox', { name: /go back/i }));
    expect(getSettings().actionBar).toEqual({ hidden: [], order: [] });
  })

  it('should move a row and save the order of the whole list', async () => {
    const settings = fixtureSettings({});
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    // The first row has no Move Up, so the first Move Down belongs to Home.
    await user.click(screen.getAllByRole('button', { name: /move down/i })[0]);
    expect(getSettings().actionBar.order.slice(0, 3)).toEqual(['BACK', 'HOME', 'FORWARD']);
    expect(getSettings().actionBar.order).toHaveLength(12);
    const names = screen.getAllByRole('checkbox').map(box => box.parentElement!.textContent!.trim());
    expect(names.slice(0, 2)).toEqual(['Go Back', 'Go to start page']);
  })

  it('should add a custom action from a preset', async () => {
    const settings = fixtureSettings({});
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    const addPreset = screen.getByRole('button', { name: /add preset/i });
    expect(addPreset).toBeDisabled();

    // Choosing only picks the preset: on Windows a closed select fires change on each arrow key.
    await user.selectOptions(screen.getByRole('combobox', { name: /^preset$/i }), 'Expand All Sections');
    expect(getSettings().customActions).toEqual([]);

    await user.click(addPreset);
    const preset = actionPresets.find(p => p.name === 'Expand All Sections')!;
    expect(getSettings().customActions).toEqual([{ id: expect.any(String), name: preset.name, js: preset.js }]);
    expect(screen.getByRole('combobox', { name: /^preset$/i })).toHaveValue('');
    expect(addPreset).toBeDisabled();
  })

  it('should not toggle a button when the section title is clicked', async () => {
    const settings = fixtureSettings({});
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByText('Actions'));
    expect(getSettings()).toEqual(settings);
    expect(screen.getByRole('checkbox', { name: 'Go to start page' })).toBeChecked();
  })

  it('should add a custom action after the last custom action when an order is saved', async () => {
    const settings = fixtureSettings({
      customActions: [{ id: 'a1', name: 'Mine', js: 'x()' }],
      actionBar: { hidden: [], order: ['CUSTOM-ACTION-a1', 'HOME'] }
    });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /add action/i }));
    const newId = 'CUSTOM-ACTION-' + getSettings().customActions[1].id;
    expect(getSettings().actionBar.order.slice(0, 3)).toEqual(['CUSTOM-ACTION-a1', newId, 'HOME']);
  })

  it('should add a custom action before Mute when an order is saved and there is no custom action', async () => {
    const settings = fixtureSettings({ actionBar: { hidden: [], order: ['BACK', 'HOME'] } });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /add action/i }));
    const { order } = getSettings().actionBar;
    expect(order.indexOf('MUTE')).toBe(order.indexOf('CUSTOM-ACTION-' + getSettings().customActions[0].id) + 1);
  })

  it('should drop a deleted custom action from the saved layout', async () => {
    const settings = fixtureSettings({
      customActions: [{ id: 'a1', name: 'Mine', js: 'x()' }],
      actionBar: { hidden: ['CUSTOM-ACTION-a1', 'HOME'], order: ['CUSTOM-ACTION-a1', 'BACK'] }
    });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByRole('button', { name: /delete action/i }));
    expect(getSettings().actionBar).toEqual({ hidden: ['HOME'], order: ['BACK'] });
  })

  it('should immediately update "injected css" setting on input type', async () => {
    const css = 'some css';
    const settings = fixtureSettings({ injectedCSS: '' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /inject css/i })

    await user.type(input, css);
    expect(getSettings()).toEqual({
      ...settings,
      injectedCSS: css
    });
  })

  it('should allow to update "injected js" setting with a debounced (3s) text input', async () => {
    const js1 = 'some';
    const js2 = 'js';
    const js3 = 'code'
    const settings = fixtureSettings({ injectedJS: '' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /inject js/i })

    await user.type(input, js1);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, js2);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, js3);

    act(() => jest.advanceTimersByTime(3000));
    expect(getSettings()).toEqual({
      ...settings,
      injectedJS: js1 + js2 + js3
    });
  })
  it('should immediately update "injected js" setting on input blur', async () => {
    const js = 'some js';
    const settings = fixtureSettings({ injectedJS: '' });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /inject js/i })

    await user.type(input, js);
    expect(getSettings()).toEqual(settings);

    fireEvent.blur(input);
    expect(getSettings()).toEqual({
      ...settings,
      injectedJS: js
    });
  })

  it('should allow to update "user agent" setting with a debounced (3s) text input', async () => {
    const ua1 = 'user';
    const ua2 = 'agent';
    const ua3 = 'line'
    const settings = fixtureSettings({ userAgent: '' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /user agent/i })

    await user.type(input, ua1);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, ua2);

    act(() => jest.advanceTimersByTime(2000));
    expect(getSettings()).toEqual(settings);

    await user.type(input, ua3);

    act(() => jest.advanceTimersByTime(3000));
    expect(getSettings()).toEqual({
      ...settings,
      userAgent: ua1 + ua2 + ua3
    });
  })
  it('should immediately update "user agent" setting on input blur', async () => {
    const ua = 'some useragent';
    const settings = fixtureSettings({ userAgent: '' });
    const { fireEvent, userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const user = userEvent.setup({ delay: null });
    const input = screen.getByRole('textbox', { name: /user agent/i })

    await user.type(input, ua);
    expect(getSettings()).toEqual(settings);

    fireEvent.blur(input);
    expect(getSettings()).toEqual({
      ...settings,
      userAgent: ua
    });
  })

  describe('createSettingsState()', () => {
    it('gives custom actions saved without an id (before the Actions list) a unique id', () => {
      const state = createSettingsState({
        customActions: [{ name: 'A', js: 'a()' }, { id: 'same', name: 'B', js: 'b()' }, { id: 'same', name: 'C', js: 'c()' }]
      } as never);
      const ids = state.customActions.map(a => a.id);
      expect(ids[1]).toBe('same');
      expect(new Set(ids).size).toBe(3);
      expect(ids.every(id => id !== '')).toBe(true);
    })

    it('starts with an empty layout', () => {
      expect(createSettingsState({}).actionBar).toEqual({ hidden: [], order: [] });
    })

    it('drops the ids of custom actions that no longer exist from the layout', () => {
      const state = createSettingsState({
        customActions: [{ id: 'a1', name: 'A', js: 'a()' }],
        actionBar: { hidden: ['CUSTOM-ACTION-gone', 'CUSTOM-ACTION-a1', 'HOME'], order: ['CUSTOM-ACTION-gone', 'BACK', 'CUSTOM-ACTION-a1'] }
      } as never);
      expect(state.actionBar).toEqual({ hidden: ['CUSTOM-ACTION-a1', 'HOME'], order: ['BACK', 'CUSTOM-ACTION-a1'] });
    })
  })
})
