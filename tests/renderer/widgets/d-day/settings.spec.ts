/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createSettingsState, settingsEditorComp, DDayEntry } from '@/widgets/d-day/settings';
import { screen } from '@testing-library/react';
import { setupSettingsSut } from '@tests/widgets/setupSut';

describe('D-Day createSettingsState()', () => {
  it('keeps valid entries as-is', () => {
    const entries: DDayEntry[] = [{ id: 'a', label: 'Exam', date: '2026-01-01' }];
    expect(createSettingsState({ entries }).entries).toEqual(entries);
  });

  it('creates a single blank entry when there are none or the value is not an array', () => {
    expect(createSettingsState({}).entries).toHaveLength(1);
    expect(createSettingsState({ entries: [] }).entries).toHaveLength(1);
    expect(createSettingsState({ entries: 'nope' as unknown as DDayEntry[] }).entries).toHaveLength(1);
  });

  it('drops an invalid date, coerces a non-string label, and generates a missing id', () => {
    const state = createSettingsState({
      entries: [{ label: 123, date: '2026-99-99' } as unknown as DDayEntry]
    });
    expect(state.entries[0].date).toBe('');
    expect(state.entries[0].label).toBe('');
    expect(state.entries[0].id).toBeTruthy();
  });

  it('defaults showDate to false and preserves a boolean value', () => {
    expect(createSettingsState({}).showDate).toBe(false);
    expect(createSettingsState({ showDate: true }).showDate).toBe(true);
    expect(createSettingsState({ showDate: 'yes' as unknown as boolean }).showDate).toBe(false);
  });
});

describe('D-Day Widget Settings editor', () => {
  it('renders one row per entry', () => {
    setupSettingsSut(settingsEditorComp, { showDate: false, entries: [
      { id: 'a', label: 'A', date: '2026-01-01' },
      { id: 'b', label: 'B', date: '2026-02-02' },
    ]});
    expect(screen.getAllByLabelText('Label')).toHaveLength(2);
    expect(screen.getAllByLabelText('Target date')).toHaveLength(2);
  });

  it('adds an entry with the Add button', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, {
      showDate: false,
      entries: [{ id: 'a', label: 'A', date: '2026-01-01' }]
    });

    await userEvent.click(screen.getByRole('button', { name: /add d-day/i }));

    expect(getSettings().entries).toHaveLength(2);
  });

  it('removes an entry with its remove button', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, {
      showDate: false,
      entries: [
        { id: 'a', label: 'A', date: '2026-01-01' },
        { id: 'b', label: 'B', date: '2026-02-02' },
      ]
    });

    await userEvent.click(screen.getByRole('button', { name: 'Remove D-day #1' }));

    expect(getSettings().entries).toEqual([{ id: 'b', label: 'B', date: '2026-02-02' }]);
  });

  it('toggles "Show the date" with the checkbox', async () => {
    const { userEvent, getSettings } = setupSettingsSut(settingsEditorComp, {
      showDate: false,
      entries: [{ id: 'a', label: 'A', date: '2026-01-01' }]
    });

    await userEvent.click(screen.getByRole('checkbox', { name: /show the date/i }));

    expect(getSettings().showDate).toBe(true);
  });
});
