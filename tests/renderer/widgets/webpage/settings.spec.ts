/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { settingsEditorComp } from '@/widgets/webpage/settings';
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

    await user.click(screen.getByRole('button', { name: /add a tab/i }));
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
})
