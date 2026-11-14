/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { resolveUiThemeId, toggledUiThemeId, uiThemeDataById, uiThemes } from '@/base/uiTheme';

describe('resolveUiThemeId()', () => {
  it('shows Light or Dark for System, as the OS mode is', () => {
    expect(resolveUiThemeId('system', 'dark')).toBe('dark');
    expect(resolveUiThemeId('system', 'light')).toBe('light');
  });

  it('shows a known theme as is, and the default theme for an unknown value', () => {
    expect(resolveUiThemeId('nord', 'light')).toBe('nord');
    expect(resolveUiThemeId('pink', 'dark')).toBe('light');
    expect(resolveUiThemeId('toString', 'dark')).toBe('light');
  });
});

describe('toggledUiThemeId()', () => {
  it.each(uiThemes.map(t => t.id))('goes from %s to a theme of the other kind', id => {
    expect(uiThemeDataById[toggledUiThemeId(id)].kind).not.toBe(uiThemeDataById[id].kind);
  });

  it('pairs go both ways', () => {
    uiThemes.filter(t => t.pair).forEach(t => expect(toggledUiThemeId(t.pair!)).toBe(t.id));
  });
});
