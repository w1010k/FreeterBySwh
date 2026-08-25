/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {createSettingsState} from '@/widgets/spreadsheet/settings';

describe('spreadsheet settings', () => {
  const CURRENT = 2;

  it('gives a brand-new sheet A..Z and a hundred rows', () => {
    const s = createSettingsState({});
    expect(s.cols).toBe(26);
    expect(s.rows).toBe(100);
  });

  it('resizes a sheet saved against older defaults, whatever else it kept', () => {
    // An out-of-date stamp is the only reliable signal. An earlier attempt
    // inferred it from a missing `rows` key and was already wrong by the time
    // it shipped — the real widget had been re-saved with `rows` in place.
    expect(createSettingsState({cols: 6, rows: 1000, decimals: -1})).toMatchObject({cols: 26, rows: 100});
    expect(createSettingsState({v: 1, cols: 52, rows: 1000})).toMatchObject({cols: 26, rows: 100});
  });

  it('respects a size chosen once the sheet carries the current stamp', () => {
    expect(createSettingsState({v: CURRENT, cols: 6, rows: 1000})).toMatchObject({cols: 6, rows: 1000});
    expect(createSettingsState({v: CURRENT, cols: 80, rows: 500})).toMatchObject({cols: 80, rows: 500});
  });

  it('stamps every sheet it builds', () => {
    expect(createSettingsState({}).v).toBe(CURRENT);
    expect(createSettingsState({cols: 6}).v).toBe(CURRENT);
  });

  it('clamps values that are out of range or nonsense', () => {
    expect(createSettingsState({v: CURRENT, cols: 0, rows: 10}).cols).toBe(1);
    expect(createSettingsState({v: CURRENT, cols: 9999, rows: 10}).cols).toBe(256);
    expect(createSettingsState({v: CURRENT, cols: 'wide', rows: 10} as never).cols).toBe(26);
    expect(createSettingsState({v: CURRENT, rows: 0}).rows).toBe(1);
  });
});
