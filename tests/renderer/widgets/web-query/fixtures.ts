/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { QueryEntry, Settings, SettingsMode } from '@/widgets/web-query/settings';

export function fixtureEntry(entry?: Partial<QueryEntry>): QueryEntry {
  return {
    id: 'ENTRY-ID',
    engine: 'ddgo',
    descr: 'Descr',
    query: '',
    url: '',
    ...entry
  }
}

export function fixtureSettings(settings?: Partial<Settings>): Settings {
  return {
    mode: SettingsMode.Browser,
    entries: [fixtureEntry()],
    ...settings
  }
}

/** Convenience: a single-entry settings built from entry-level fields. */
export function fixtureSettings1(mode: SettingsMode, entry?: Partial<QueryEntry>): Settings {
  return {
    mode,
    entries: [fixtureEntry(entry)]
  }
}
