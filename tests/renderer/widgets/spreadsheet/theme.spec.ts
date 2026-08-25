/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {uiThemes} from '@/ui/components/app/uiTheme/themes';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * A `var(--freeter-x)` that no theme defines makes the whole declaration
 * invalid, so the property silently does nothing — `outline: 2px solid
 * var(--nope)` draws no outline at all. That's how the selected cell became
 * invisible: two invented names, `accentColor` and `errorColor`, neither of
 * which the theme has. Nothing in the build or the type system catches it.
 */
const scss = readFileSync(join(__dirname, '../../../../src/renderer/widgets/spreadsheet/widget.module.scss'), 'utf-8');

describe('spreadsheet stylesheet', () => {
  it('only uses theme variables that actually exist', () => {
    const used = [...scss.matchAll(/var\(\s*--freeter-([A-Za-z0-9]+)/g)].map(m => m[1]);
    expect(used.length).toBeGreaterThan(0);

    const missing = [...new Set(used)].filter(name => !(name in uiThemes.light) || !(name in uiThemes.dark));
    expect(missing).toEqual([]);
  });
});
