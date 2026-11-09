/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {uiThemes} from '@/ui/components/app/uiTheme/themes';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * A `var(--freeter-x)` that no theme defines makes the whole declaration
 * invalid, so the property silently does nothing (`outline: 2px solid
 * var(--nope)` draws no outline at all). Nothing in the build or the type
 * system catches it, so every widget stylesheet is checked here. A variable
 * with a fallback (`var(--freeter-x, ...)`) is safe, so it is skipped.
 */
const widgetsDir = join(__dirname, '../../../src/renderer/widgets');
const stylesheets = readdirSync(widgetsDir, {recursive: true, encoding: 'utf-8'}).filter(f => f.endsWith('.scss'));

describe('widget stylesheets', () => {
  it('exist', () => {
    expect(stylesheets.length).toBeGreaterThan(0);
  });

  it.each(stylesheets)('%s only uses theme variables that actually exist', file => {
    const scss = readFileSync(join(widgetsDir, file), 'utf-8');
    const used = [...scss.matchAll(/var\(\s*--freeter-([A-Za-z0-9]+)\s*\)/g)].map(m => m[1]);
    const missing = [...new Set(used)].filter(name => !(name in uiThemes.light) || !(name in uiThemes.dark));
    expect(missing).toEqual([]);
  });
});
