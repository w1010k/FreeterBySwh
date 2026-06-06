/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, defaultEngine, settingsEditorComp, SettingsMode } from '@/widgets/web-query/settings';
import { screen, waitFor, within } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut'
import { fixtureEntry, fixtureSettings1 } from './fixtures';

describe('createSettingsState()', () => {
  it('should default to Browser mode and a single default-engine entry, when given empty settings', () => {
    const state = createSettingsState({})

    expect(state.mode).toBe(SettingsMode.Browser);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].engine).toBe(defaultEngine.id);
    expect(typeof state.entries[0].id).toBe('string');
    expect(state.entries[0].id).not.toBe('');
  })

  it('should fall back to Browser mode, when mode is invalid', () => {
    const state = createSettingsState({ entries: [fixtureEntry({ engine: '' })] })

    expect(state.mode).toBe(SettingsMode.Browser);
  })

  describe('legacy single-config migration', () => {
    it('should wrap a legacy custom-engine config into a single entry', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, engine: '', descr: 'Descr', query: 'Query', url: 'Url' })

      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].engine).toBe('');
      expect(state.entries[0].descr).toBe('Descr');
      expect(state.entries[0].query).toBe('Query');
      expect(state.entries[0].url).toBe('Url');
    })

    it('should use the default engine, when legacy engine is not a string', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, descr: 'Descr', query: 'Query', url: 'Url' })

      expect(state.entries[0].engine).toBe(defaultEngine.id);
      expect(state.entries[0].descr).toBe('');
      expect(state.entries[0].url).toBe('');
      expect(state.entries[0].query).toBe('Query');
    })

    it('should keep a legacy non-custom engine and clear descr/url', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, engine: 'ddgo-lite', descr: 'Descr', query: 'Query', url: 'Url' })

      expect(state.entries[0].engine).toBe('ddgo-lite');
      expect(state.entries[0].descr).toBe('');
      expect(state.entries[0].url).toBe('');
      expect(state.entries[0].query).toBe('Query');
    })

    it('should use the default engine, when legacy engine id does not exist', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, engine: 'NO-SUCH-ID', descr: 'Descr', query: 'Query', url: 'Url' })

      expect(state.entries[0].engine).toBe(defaultEngine.id);
    })

    it('should wrap a legacy Webpages config into a single entry', () => {
      const state = createSettingsState({ mode: SettingsMode.Webpages, engine: '', descr: 'Descr', query: 'Query', url: 'Url' })

      expect(state.mode).toBe(SettingsMode.Webpages);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].engine).toBe('');
      expect(state.entries[0].descr).toBe('Descr');
      expect(state.entries[0].url).toBe('');
      expect(state.entries[0].query).toBe('Query');
    })
  })

  describe('entries[] normalization', () => {
    it('should preserve existing entry ids', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, entries: [fixtureEntry({ id: 'keep-me', engine: 'goog' })] })

      expect(state.entries[0].id).toBe('keep-me');
    })

    it('should generate ids for entries missing one', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, entries: [fixtureEntry({ id: '', engine: 'goog' })] })

      expect(typeof state.entries[0].id).toBe('string');
      expect(state.entries[0].id).not.toBe('');
    })

    it('should normalize each entry by mode (Browser: clear descr/url for known engine)', () => {
      const state = createSettingsState({
        mode: SettingsMode.Browser,
        entries: [
          fixtureEntry({ id: 'a', engine: 'goog', descr: 'x', url: 'y' }),
          fixtureEntry({ id: 'b', engine: '', descr: 'custom', url: 'https://x/QUERY' })
        ]
      })

      expect(state.entries).toHaveLength(2);
      expect(state.entries[0]).toEqual({ id: 'a', engine: 'goog', descr: '', url: '', query: '' });
      expect(state.entries[1]).toEqual({ id: 'b', engine: '', descr: 'custom', url: 'https://x/QUERY', query: '' });
    })

    it('should replace an empty entries array with one default entry', () => {
      const state = createSettingsState({ mode: SettingsMode.Browser, entries: [] })

      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].engine).toBe(defaultEngine.id);
    })
  })
})

describe('Web Query Widget Settings', () => {
  it('should fill Mode input with right value', () => {
    const settings = fixtureSettings1(SettingsMode.Webpages);
    setupSettingsSut(settingsEditorComp, settings);

    expect(screen.getByRole('combobox', { name: /mode/i })).toHaveValue(settings.mode.toString());
  })

  it('should allow to update "mode" setting with an option select', async () => {
    const settings = fixtureSettings1(SettingsMode.Webpages, { engine: '', descr: 'Descr' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const select = screen.getByRole('combobox', { name: /mode/i })

    userEvent.selectOptions(select, SettingsMode.Browser.toString());
    await waitFor(() => expect((screen.getByRole('option', { name: 'Browser App' }) as HTMLOptionElement).selected).toBe(true))
    expect(getSettings().mode).toBe(SettingsMode.Browser);
  })

  it('should carry the engine description into descr, when switching "mode" from Browser to Webpages', async () => {
    const settings = fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
    const select = screen.getByRole('combobox', { name: /mode/i })

    userEvent.selectOptions(select, SettingsMode.Webpages.toString());
    await waitFor(() => expect((screen.getByRole('option', { name: 'Webpage Widgets' }) as HTMLOptionElement).selected).toBe(true))
    expect(getSettings().mode).toBe(SettingsMode.Webpages);
    expect(getSettings().entries[0].descr).toBe(defaultEngine.descr);
  })

  it('should add a query entry on "Add query" click', async () => {
    const settings = fixtureSettings1(SettingsMode.Browser, { engine: 'goog' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);

    await userEvent.click(screen.getByRole('button', { name: /add query/i }));

    expect(getSettings().entries).toHaveLength(2);
    expect(getSettings().entries[1].engine).toBe(defaultEngine.id);
  })

  it('should remove a query entry on its "Remove" click', async () => {
    const settings = {
      mode: SettingsMode.Browser,
      entries: [fixtureEntry({ id: 'a', engine: 'goog' }), fixtureEntry({ id: 'b', engine: 'bing' })]
    };
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);

    await userEvent.click(screen.getByRole('button', { name: /remove query #1/i }));

    expect(getSettings().entries).toHaveLength(1);
    expect(getSettings().entries[0].id).toBe('b');
  })

  it('should keep at least one entry, when removing the last one', async () => {
    const settings = fixtureSettings1(SettingsMode.Browser, { id: 'only', engine: 'goog' });
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);

    await userEvent.click(screen.getByRole('button', { name: /remove query #1/i }));

    expect(getSettings().entries).toHaveLength(1);
    expect(getSettings().entries[0].id).not.toBe('only');
  })

  it('should move a query entry down on its "Move down" click', async () => {
    const settings = {
      mode: SettingsMode.Browser,
      entries: [fixtureEntry({ id: 'a', engine: 'goog' }), fixtureEntry({ id: 'b', engine: 'bing' })]
    };
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);

    await userEvent.click(screen.getByRole('button', { name: /move query #1 down/i }));

    expect(getSettings().entries.map(e => e.id)).toEqual(['b', 'a']);
  })

  it('should move a query entry up on its "Move up" click', async () => {
    const settings = {
      mode: SettingsMode.Browser,
      entries: [fixtureEntry({ id: 'a', engine: 'goog' }), fixtureEntry({ id: 'b', engine: 'bing' })]
    };
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);

    await userEvent.click(screen.getByRole('button', { name: /move query #2 up/i }));

    expect(getSettings().entries.map(e => e.id)).toEqual(['b', 'a']);
  })

  it('should disable Move up for the first entry and Move down for the last entry', () => {
    const settings = {
      mode: SettingsMode.Browser,
      entries: [fixtureEntry({ id: 'a', engine: 'goog' }), fixtureEntry({ id: 'b', engine: 'bing' })]
    };
    setupSettingsSut(settingsEditorComp, settings);

    expect(screen.getByRole('button', { name: /move query #1 up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move query #2 down/i })).toBeDisabled();
  })

  describe('Browser mode (single entry)', () => {
    it('should show right inputs', () => {
      const settings = fixtureSettings1(SettingsMode.Browser);
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('combobox', { name: /query engine/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /url template/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /query template/i })).toBeInTheDocument();
    })

    it('should fill inputs with right values, when engine==custom', () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: '', descr: 'Some Descr', query: 'Some Query', url: 'Some Url' });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('combobox', { name: /query engine/i })).toHaveValue('');
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Some Descr');
      expect(screen.getByRole('textbox', { name: /url template/i })).toHaveValue('Some Url');
      expect(screen.getByRole('textbox', { name: /query template/i })).toHaveValue('Some Query');
    })

    it('should fill inputs with right values, when engine!==custom', () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id, descr: 'Some Descr', query: 'Some Query', url: 'Some Url' });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('combobox', { name: /query engine/i })).toHaveValue(defaultEngine.id);
      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue(defaultEngine.descr);
      expect(screen.getByRole('textbox', { name: /url template/i })).toHaveValue(defaultEngine.url);
      expect(screen.getByRole('textbox', { name: /query template/i })).toHaveValue('Some Query');
    })

    it('should enable descr/url inputs, when engine==custom', () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: '' });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('textbox', { name: /description/i })).toBeEnabled();
      expect(screen.getByRole('textbox', { name: /url template/i })).toBeEnabled();
    })

    it('should disable descr/url inputs, when engine!==custom', () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('textbox', { name: /description/i })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /url template/i })).toBeDisabled();
    })

    it('should allow to update "engine" setting with an option select', async () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const select = screen.getByRole('combobox', { name: /query engine/i })

      userEvent.selectOptions(select, 'goog');
      await waitFor(() => expect((screen.getByRole('option', { name: 'Google' }) as HTMLOptionElement).selected).toBe(true))
      expect(getSettings().entries[0].engine).toBe('goog');
    })

    it('should seed descr/url with current engine\'s values, when switching "engine" from non-custom to custom', async () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: defaultEngine.id });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const select = screen.getByRole('combobox', { name: /query engine/i })

      userEvent.selectOptions(select, '');
      await waitFor(() => expect((screen.getByRole('option', { name: 'Custom Engine' }) as HTMLOptionElement).selected).toBe(true))
      expect(getSettings().entries[0]).toMatchObject({
        engine: '',
        descr: defaultEngine.descr,
        url: defaultEngine.url
      });
    })

    it('should allow to update "descr" setting with a text input', async () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: '', descr: 'descr' });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const input = screen.getByRole('textbox', { name: /description/i })

      await userEvent.type(input, '!');

      expect(getSettings().entries[0].descr).toBe('descr!');
    })

    it('should allow to update "url" setting with a text input', async () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: '', url: 'url' });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const input = screen.getByRole('textbox', { name: /url template/i })

      await userEvent.type(input, '!');

      expect(getSettings().entries[0].url).toBe('url!');
    })

    it('should allow to update "query" setting with a text input', async () => {
      const settings = fixtureSettings1(SettingsMode.Browser, { engine: '', query: 'query' });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const input = screen.getByRole('textbox', { name: /query template/i })

      await userEvent.type(input, '!');

      expect(getSettings().entries[0].query).toBe('query!');
    })
  })

  describe('Webpages mode (single entry)', () => {
    it('should show right inputs', () => {
      const settings = fixtureSettings1(SettingsMode.Webpages);
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.queryByRole('combobox', { name: /query engine/i })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /url template/i })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /query template/i })).toBeInTheDocument();
    })

    it('should fill inputs with right values', () => {
      const settings = fixtureSettings1(SettingsMode.Webpages, { descr: 'Some Descr', query: 'Some Query' });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue('Some Descr');
      expect(screen.getByRole('textbox', { name: /query template/i })).toHaveValue('Some Query');
    })

    it('should enable descr input', () => {
      const settings = fixtureSettings1(SettingsMode.Webpages, { engine: '', descr: 'Descr' });
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getByRole('textbox', { name: /description/i })).toBeEnabled();
    })

    it('should allow to update "descr" setting with a text input', async () => {
      const settings = fixtureSettings1(SettingsMode.Webpages, { descr: 'descr' });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const input = screen.getByRole('textbox', { name: /description/i })

      await userEvent.type(input, '!');

      expect(getSettings().entries[0].descr).toBe('descr!');
    })

    it('should allow to update "query" setting with a text input', async () => {
      const settings = fixtureSettings1(SettingsMode.Webpages, { query: 'query' });
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const input = screen.getByRole('textbox', { name: /query template/i })

      await userEvent.type(input, '!');

      expect(getSettings().entries[0].query).toBe('query!');
    })
  })

  describe('multiple entries in the editor', () => {
    it('should render the controls for each entry', () => {
      const settings = {
        mode: SettingsMode.Browser,
        entries: [fixtureEntry({ id: 'a', engine: 'goog' }), fixtureEntry({ id: 'b', engine: '' })]
      };
      setupSettingsSut(settingsEditorComp, settings);

      expect(screen.getAllByRole('combobox', { name: /query engine/i })).toHaveLength(2);
    })

    it('should update only the targeted entry', async () => {
      const settings = {
        mode: SettingsMode.Browser,
        entries: [fixtureEntry({ id: 'a', engine: '', query: '' }), fixtureEntry({ id: 'b', engine: '', query: '' })]
      };
      const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, settings);
      const secondBlock = within(screen.getByText('Query #2').closest('fieldset') as HTMLElement);

      await userEvent.type(secondBlock.getByRole('textbox', { name: /query template/i }), 'x');

      expect(getSettings().entries[0].query).toBe('');
      expect(getSettings().entries[1].query).toBe('x');
    })
  })
})
