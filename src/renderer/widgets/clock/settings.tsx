/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';
import { isValidTimeZone } from './clock';
import styles from './settings.module.scss';

export interface ClockEntry {
  id: string;
  label: string;
  /** IANA time zone, or '' for the local zone. */
  timeZone: string;
}

export interface Settings {
  entries: ClockEntry[];
  hour12: boolean;
  showSeconds: boolean;
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

type RawEntry = Partial<ClockEntry> & Record<string, unknown>;

function normalizeEntry(raw: RawEntry | undefined): ClockEntry {
  const src: RawEntry = raw || {};
  const tz = typeof src.timeZone === 'string' && isValidTimeZone(src.timeZone) ? src.timeZone : '';
  return {
    id: typeof src.id === 'string' && src.id !== '' ? src.id : genEntryId(),
    label: typeof src.label === 'string' ? src.label : '',
    timeZone: tz,
  };
}

export function makeNewEntry(): ClockEntry {
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
    hour12: typeof settings.hour12 === 'boolean' ? settings.hour12 : false,
    showSeconds: typeof settings.showSeconds === 'boolean' ? settings.showSeconds : false,
    showDate: typeof settings.showDate === 'boolean' ? settings.showDate : false,
  };
}

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;

  const toggle = (key: 'hour12' | 'showSeconds' | 'showDate') =>
    updateSettings({ ...settings, [key]: !settings[key] });

  function updEntry(id: string, patch: Partial<ClockEntry>) {
    updateSettings({ ...settings, entries: settings.entries.map(e => (e.id === id ? { ...e, ...patch } : e)) });
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
      <SettingBlock titleForId='clock-format' title='Format'>
        <div>
          <label><input type="checkbox" id="clock-format" checked={settings.hour12} onChange={() => toggle('hour12')} /> 12-hour clock</label>
        </div>
        <div>
          <label><input type="checkbox" checked={settings.showSeconds} onChange={() => toggle('showSeconds')} /> Show seconds</label>
        </div>
        <div>
          <label><input type="checkbox" checked={settings.showDate} onChange={() => toggle('showDate')} /> Show date</label>
        </div>
      </SettingBlock>

      <SettingBlock
        title='Clocks'
        moreInfo='Each row is a clock. Leave the time zone empty for local time, or enter an IANA zone like "America/New_York" or "Asia/Seoul".'
      >
        <div className={styles['entries']}>
          {settings.entries.map((entry, idx) => (
            <div key={entry.id} className={styles['entry']} data-testid={`entry-${idx}`}>
              <span className={styles['num']}>#{idx + 1}</span>
              <button type="button" aria-label={`Move clock #${idx + 1} up`} disabled={idx === 0} onClick={() => moveEntry(idx, -1)}>↑</button>
              <button type="button" aria-label={`Move clock #${idx + 1} down`} disabled={idx === settings.entries.length - 1} onClick={() => moveEntry(idx, 1)}>↓</button>
              <input
                aria-label="Label"
                className={styles['label']}
                type="text"
                value={entry.label}
                maxLength={100}
                onChange={e => updEntry(entry.id, { label: e.target.value })}
                placeholder="Label (e.g. Seoul)"
              />
              <input
                aria-label="Time zone"
                className={styles['tz']}
                type="text"
                value={entry.timeZone}
                maxLength={64}
                onChange={e => updEntry(entry.id, { timeZone: e.target.value })}
                placeholder="Time zone (empty = local)"
              />
              <button type="button" aria-label={`Remove clock #${idx + 1}`} onClick={() => removeEntry(entry.id)}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className={styles['add']} onClick={addEntry}>+ Add clock</button>
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
