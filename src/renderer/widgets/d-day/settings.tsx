/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';
import { parseLocalDate } from './dDay';
import styles from './settings.module.scss';

/** A single D-day row: a label and the target date (`YYYY-MM-DD`). */
export interface DDayEntry {
  id: string;
  label: string;
  date: string;
}

export interface Settings {
  entries: DDayEntry[];
  /** Show each target date (with weekday) under its count. */
  showDate: boolean;
}

let entryIdCounter = 0;
function genEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  entryIdCounter += 1;
  return `e${Date.now()}-${entryIdCounter}`;
}

type RawEntry = Partial<DDayEntry> & Record<string, unknown>;

function normalizeEntry(raw: RawEntry | undefined): DDayEntry {
  const src: RawEntry = raw || {};
  // Keep only real, parseable calendar dates — rejects both malformed strings
  // and format-valid-but-impossible ones like "2026-99-99".
  const date = typeof src.date === 'string' && parseLocalDate(src.date) ? src.date : '';
  return {
    id: typeof src.id === 'string' && src.id !== '' ? src.id : genEntryId(),
    label: typeof src.label === 'string' ? src.label : '',
    date,
  };
}

export function makeNewEntry(): DDayEntry {
  return normalizeEntry(undefined);
}

export const createSettingsState: CreateSettingsState<Settings> = (settings) => {
  const rawEntries = Array.isArray(settings.entries) ? settings.entries : [];
  let entries = rawEntries.map(e => normalizeEntry(e as RawEntry));
  if (entries.length === 0) {
    entries = [makeNewEntry()];
  }
  return {
    entries,
    showDate: typeof settings.showDate === 'boolean' ? settings.showDate : false,
  };
}

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;

  function updEntry(id: string, patch: Partial<DDayEntry>) {
    updateSettings({
      ...settings,
      entries: settings.entries.map(e => (e.id === id ? { ...e, ...patch } : e))
    });
  }

  function addEntry() {
    updateSettings({ ...settings, entries: [...settings.entries, makeNewEntry()] });
  }

  function removeEntry(id: string) {
    const entries = settings.entries.filter(e => e.id !== id);
    updateSettings({ ...settings, entries: entries.length > 0 ? entries : [makeNewEntry()] });
  }

  function moveEntry(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= settings.entries.length) {
      return;
    }
    const entries = [...settings.entries];
    [entries[idx], entries[target]] = [entries[target], entries[idx]];
    updateSettings({ ...settings, entries });
  }

  return (
    <>
    <SettingBlock
      titleForId='d-day-show-date'
      title='Date'
    >
      <label>
        <input
          type="checkbox"
          id="d-day-show-date"
          checked={settings.showDate}
          onChange={() => updateSettings({ ...settings, showDate: !settings.showDate })}
        />
        Show the date (with weekday)
      </label>
    </SettingBlock>

    <SettingBlock
      title='D-Days'
      moreInfo='Each row is a countdown. The target date shows as D-DAY; days before it show as D-N and days after it as D+N.'
    >
      <div className={styles['entries']}>
        {settings.entries.map((entry, idx) => (
          <div key={entry.id} className={styles['entry']} data-testid={`entry-${idx}`}>
            <span className={styles['num']}>#{idx + 1}</span>
            <button type="button" aria-label={`Move D-day #${idx + 1} up`} disabled={idx === 0} onClick={() => moveEntry(idx, -1)}>↑</button>
            <button type="button" aria-label={`Move D-day #${idx + 1} down`} disabled={idx === settings.entries.length - 1} onClick={() => moveEntry(idx, 1)}>↓</button>
            <input
              aria-label="Label"
              className={styles['label']}
              type="text"
              value={entry.label}
              maxLength={100}
              onChange={e => updEntry(entry.id, { label: e.target.value })}
              placeholder="Label (e.g. Exam)"
            />
            <input
              aria-label="Target date"
              className={styles['date']}
              type="date"
              value={entry.date}
              onChange={e => updEntry(entry.id, { date: e.target.value })}
            />
            <button type="button" aria-label={`Remove D-day #${idx + 1}`} onClick={() => removeEntry(entry.id)}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className={styles['add']} onClick={addEntry}>+ Add D-day</button>
    </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
