/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { spreadsheetAiActions } from '@/widgets/spreadsheet/aiActions';
import { WidgetAiAction } from '@/base/ai/widgetAiAction';

function setup(rows: string[][] | undefined, busy = false) {
  let sheet = rows;
  const set = jest.fn((row: number, col: number, values: string[][]) => {
    if (busy || !sheet) {
      return false;
    }
    sheet = sheet.map(r => [...r]);
    values.forEach((line, i) => line.forEach((v, j) => {
      while (sheet!.length <= row + i) {
        sheet!.push([]);
      }
      sheet![row + i][col + j] = v;
    }));
    return true;
  });
  const api = { sheet: { get: () => sheet, set } };
  const get = (name: string) => spreadsheetAiActions.find(a => a.name === name) as WidgetAiAction;
  const exec = (name: string, input: Record<string, unknown>) => {
    const parsed = get(name).parse(input);
    if (parsed === undefined) {
      throw new Error('parse failed');
    }
    return Promise.resolve(get(name).run({ api, settings: {} }, parsed));
  };
  return { get, exec, set, sheet: () => sheet };
}

describe('spreadsheetAiActions', () => {
  it('getCells returns the used area as raw text, formulas included', async () => {
    const { exec } = setup([['a', '=1+1', ''], ['', '', ''], ['', '', '']]);
    await expect(exec('getCells', {})).resolves.toEqual({ ok: true, value: { rows: [['a', '=1+1']] } });
  });

  it('returns not_ready while the sheet is loading', async () => {
    await expect(setup(undefined).exec('getCells', {})).resolves.toMatchObject({ code: 'not_ready' });
  });

  it('setCells writes a block from an A1 reference', async () => {
    const { exec, set } = setup([['', ''], ['', '']]);
    await expect(exec('setCells', { cell: 'B2', values: [['x', 'y'], ['z']] })).resolves.toEqual({ ok: true, value: null });
    expect(set).toHaveBeenCalledWith(1, 1, [['x', 'y'], ['z']]);
  });

  it('answers failed while the user is editing a cell', async () => {
    await expect(setup([['']], true).exec('setCells', { cell: 'A1', values: [['x']] })).resolves.toMatchObject({ ok: false, code: 'failed' });
  });

  it('parse rejects bad references, non-string values and too many cells', () => {
    const { get } = setup([]);
    const parse = get('setCells').parse;
    expect(parse({ cell: '1A', values: [['x']] })).toBeUndefined();
    expect(parse({ cell: 'A0', values: [['x']] })).toBeUndefined();
    expect(parse({ cell: 'A1', values: [[1]] })).toBeUndefined();
    expect(parse({ cell: 'A1', values: 'x' })).toBeUndefined();
    expect(parse({ cell: 'A1', values: [] })).toBeUndefined();
    expect(parse({ cell: 'A1', values: Array.from({ length: 101 }, () => Array(100).fill('v')) })).toBeUndefined();
    expect(parse({ cell: 'c3', values: [['x']] })).toEqual({ row: 2, col: 2, values: [['x']] });
  });

  it('describes the write for the confirm dialog', () => {
    const { get } = setup([]);
    expect(get('setCells').describe({ row: 1, col: 1, values: [['a', 'b'], ['c']] }, 'Budget', {})).toBe('Write 2 rows x 2 columns at B2 in spreadsheet "Budget"');
  });
});
