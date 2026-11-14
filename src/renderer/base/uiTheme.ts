/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Light themes first, then dark ones: the Theme setting lists them in this order.
const uiThemeIds = [
  'light', 'solarized-light', 'catppuccin-latte',
  'dark', 'one-dark', 'nord', 'tokyo-night', 'dracula', 'catppuccin-mocha', 'solarized-dark',
] as const;

export type UiThemeId = typeof uiThemeIds[number];

/** Light or dark. Also the id of the plain theme of that kind ('light', 'dark'). */
export type UiThemeKind = 'light' | 'dark';

/** The Theme setting: a theme, or 'system' (Light or Dark, as the OS light/dark mode is). */
export type UiThemeSetting = UiThemeId | 'system';

export const defaultUiThemeId: UiThemeId = 'light';

export interface UiThemeData {
  name: string;
  kind: UiThemeKind;
  /** The theme of the other kind that the light/dark toggle goes to. Without it, the toggle goes to Light or Dark. */
  pair?: UiThemeId;
}

export const uiThemeDataById: Record<UiThemeId, UiThemeData> = {
  ['light']: { name: 'Light', kind: 'light' },
  ['solarized-light']: { name: 'Solarized Light', kind: 'light', pair: 'solarized-dark' },
  ['catppuccin-latte']: { name: 'Catppuccin Latte', kind: 'light', pair: 'catppuccin-mocha' },
  ['dark']: { name: 'Dark', kind: 'dark' },
  ['one-dark']: { name: 'One Dark', kind: 'dark' },
  ['nord']: { name: 'Nord', kind: 'dark' },
  ['tokyo-night']: { name: 'Tokyo Night', kind: 'dark' },
  ['dracula']: { name: 'Dracula', kind: 'dark' },
  ['catppuccin-mocha']: { name: 'Catppuccin Mocha', kind: 'dark', pair: 'catppuccin-latte' },
  ['solarized-dark']: { name: 'Solarized Dark', kind: 'dark', pair: 'solarized-light' },
}

export const uiThemes = uiThemeIds.map(id => ({ id, ...uiThemeDataById[id] }));

/** The choices of the Theme setting. */
export const uiThemeSettings: ReadonlyArray<{ id: UiThemeSetting; name: string }> = [
  { id: 'system', name: 'System (OS light/dark mode)' },
  ...uiThemes
];

function isUiThemeId(id: string): id is UiThemeId {
  return Object.hasOwn(uiThemeDataById, id);
}

/** The theme shown for a Theme setting value. An unknown value shows the default theme. */
export function resolveUiThemeId(setting: string, systemKind: UiThemeKind): UiThemeId {
  if (setting === 'system') {
    return systemKind;
  }
  return isUiThemeId(setting) ? setting : defaultUiThemeId;
}

/** The theme the light/dark toggle goes to from a theme. */
export function toggledUiThemeId(id: UiThemeId): UiThemeId {
  const { kind, pair } = uiThemeDataById[id];
  return pair ?? (kind === 'dark' ? 'light' : 'dark');
}
