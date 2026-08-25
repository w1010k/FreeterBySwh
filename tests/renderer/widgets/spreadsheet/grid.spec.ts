/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {evaluateGrid} from '@/widgets/spreadsheet/formula';
import {
  acceptsRef,
  applyLineOp,
  applyPatch,
  blockJump,
  clearBox,
  dataRegion,
  dropTrailingRef,
  fillFrom,
  fillTarget,
  fromTsv,
  inBox,
  lastUsedCell,
  looksLikeHeader,
  makeFormatter,
  normalize,
  refName,
  selectionBox,
  selectionStats,
  sortRegion,
  toTsv,
  trimSheet
} from '@/widgets/spreadsheet/grid';
import {DECIMALS_AUTO} from '@/widgets/spreadsheet/settings';

describe('selection', () => {
  it('normalises a box drawn in any direction', () => {
    const box = selectionBox({anchor: {row: 3, col: 4}, focus: {row: 1, col: 2}});
    expect(box).toEqual({top: 1, bottom: 3, left: 2, right: 4});
    expect(inBox(box, 2, 3)).toBe(true);
    expect(inBox(box, 0, 3)).toBe(false);
  });
});

describe('normalize', () => {
  it('pads short rows out to the column count', () => {
    expect(normalize([['a']], 3)).toEqual([['a', '', '']]);
  });

  it('keeps cells beyond the column count so narrowing the sheet loses no data', () => {
    // The normalized rows are what gets written back to disk, so truncating
    // here would erase columns D+ the moment the user typed anything.
    expect(normalize([['a', 'b', 'c', 'd']], 2)).toEqual([['a', 'b', 'c', 'd']]);
  });
});

describe('reference picking helpers', () => {
  it('accepts a reference only where one can legally go', () => {
    expect(acceptsRef('=')).toBe(true);
    expect(acceptsRef('=A1+')).toBe(true);
    expect(acceptsRef('=SUM(')).toBe(true);
    expect(acceptsRef('=SUM(A1,')).toBe(true);
    expect(acceptsRef('=A1')).toBe(false); // A ref is already there.
    expect(acceptsRef('12')).toBe(false); // Not a formula at all.
  });

  it('replaces the trailing reference rather than appending another', () => {
    expect(dropTrailingRef('=A1')).toBe('=');
    expect(dropTrailingRef('=A1+B22')).toBe('=A1+');
    expect(dropTrailingRef('=SUM(')).toBe('=SUM(');
  });

  it('names cells the way the sheet labels them', () => {
    expect(refName({row: 0, col: 0})).toBe('A1');
    expect(refName({row: 9, col: 27})).toBe('AB10');
  });
});

describe('clipboard', () => {
  const sheet = [['1', '2', '=A1+B1'], ['x', 'y', 'z']];

  it('copies raw text so formulas survive the round trip', () => {
    expect(toTsv(sheet, {top: 0, bottom: 0, left: 0, right: 2})).toBe('1\t2\t=A1+B1');
    expect(toTsv(sheet, {top: 0, bottom: 1, left: 1, right: 2})).toBe('2\t=A1+B1\ny\tz');
  });

  it('parses pasted TSV and drops the trailing newline Excel adds', () => {
    expect(fromTsv('1\t2\r\n3\t4\r\n')).toEqual([['1', '2'], ['3', '4']]);
  });

  it('writes a patch at the target cell and grows the sheet to fit', () => {
    const out = applyPatch(normalize([['a', 'b', 'c']], 3), {row: 0, col: 1}, [['X'], ['Y'], ['Z']], 3);
    expect(out).toEqual([['a', 'X', 'c'], ['', 'Y', ''], ['', 'Z', '']]);
  });
});

describe('clearBox', () => {
  it('empties only the selected rectangle', () => {
    const out = clearBox([['1', '2', '3'], ['4', '5', '6']], {top: 0, bottom: 1, left: 1, right: 1});
    expect(out).toEqual([['1', '', '3'], ['4', '', '6']]);
  });
});

describe('makeFormatter', () => {
  it('leaves text and error codes alone', () => {
    const fmt = makeFormatter({decimals: 2, thousands: true});
    expect(fmt('abc')).toBe('abc');
    expect(fmt('#DIV/0')).toBe('#DIV/0');
  });

  it('trims float noise on auto but keeps integers bare', () => {
    const fmt = makeFormatter({decimals: DECIMALS_AUTO, thousands: false});
    expect(fmt(0.1 + 0.2)).toBe('0.3');
    expect(fmt(1)).toBe('1');
  });

  it('applies fixed decimals and thousands grouping', () => {
    expect(makeFormatter({decimals: 2, thousands: false})(1234.5)).toBe('1234.50');
    expect(makeFormatter({decimals: 2, thousands: true})(1234.5)).toBe('1,234.50');
    expect(makeFormatter({decimals: 0, thousands: true})(1234567)).toBe('1,234,567');
  });

  it('reports a non-finite result rather than printing Infinity', () => {
    expect(makeFormatter({decimals: DECIMALS_AUTO, thousands: false})(Infinity)).toBe('#NUM');
  });
});

describe('fillTarget', () => {
  const src = {top: 1, bottom: 2, left: 1, right: 2};

  it('snaps to whichever axis the pointer moved furthest along', () => {
    expect(fillTarget(src, {row: 6, col: 3})).toEqual({...src, bottom: 6});
    expect(fillTarget(src, {row: 3, col: 8})).toEqual({...src, right: 8});
  });

  it('extends backwards too', () => {
    expect(fillTarget(src, {row: 0, col: 1})).toEqual({...src, top: 0});
    expect(fillTarget(src, {row: 1, col: 0})).toEqual({...src, left: 0});
  });

  it('returns the source when the pointer never left it', () => {
    expect(fillTarget(src, {row: 2, col: 2})).toEqual(src);
  });
});

describe('fillFrom', () => {
  const col = (rows: string[]) => rows.map(v => [v, '', '']);

  it('continues an arithmetic run', () => {
    const out = fillFrom(col(['1', '3', '', '', '']), {top: 0, bottom: 1, left: 0, right: 0}, {
      top: 0,
      bottom: 4,
      left: 0,
      right: 0
    }, 3);
    expect(out.map(r => r[0])).toEqual(['1', '3', '5', '7', '9']);
  });

  it('repeats a single value rather than counting up', () => {
    const out = fillFrom(col(['7', '', '']), {top: 0, bottom: 0, left: 0, right: 0}, {
      top: 0,
      bottom: 2,
      left: 0,
      right: 0
    }, 3);
    expect(out.map(r => r[0])).toEqual(['7', '7', '7']);
  });

  it('repeats text and cycles a multi-cell pattern', () => {
    const out = fillFrom(col(['a', 'b', '', '', '']), {top: 0, bottom: 1, left: 0, right: 0}, {
      top: 0,
      bottom: 4,
      left: 0,
      right: 0
    }, 3);
    expect(out.map(r => r[0])).toEqual(['a', 'b', 'a', 'b', 'a']);
  });

  it('rewrites formula references for their new row', () => {
    const rows = [['1', '2', '=A1+B1'], ['3', '4', ''], ['5', '6', '']];
    const out = fillFrom(rows, {top: 0, bottom: 0, left: 2, right: 2}, {top: 0, bottom: 2, left: 2, right: 2}, 3);
    expect(out.map(r => r[2])).toEqual(['=A1+B1', '=A2+B2', '=A3+B3']);
  });

  it('fills sideways, rewriting columns instead of rows', () => {
    const rows = [['1', '2', '3'], ['=A1', '', '']];
    const out = fillFrom(rows, {top: 1, bottom: 1, left: 0, right: 0}, {top: 1, bottom: 1, left: 0, right: 2}, 3);
    expect(out[1]).toEqual(['=A1', '=B1', '=C1']);
  });

  it('counts backwards when filling upwards', () => {
    const rows = [['', '', ''], ['', '', ''], ['10', '', ''], ['12', '', '']];
    const out = fillFrom(rows, {top: 2, bottom: 3, left: 0, right: 0}, {top: 0, bottom: 3, left: 0, right: 0}, 3);
    expect(out.map(r => r[0])).toEqual(['6', '8', '10', '12']);
  });
});

describe('applyLineOp', () => {
  const sheet = () => [
    ['a1', 'b1', '=A1&B1'],
    ['a2', 'b2', '=A2&B2'],
    ['a3', 'b3', '=SUM(A1:A3)']
  ];

  it('inserts a row and slides later references down', () => {
    const out = applyLineOp(sheet(), 'insertRow', 1, 3);
    expect(out.length).toBe(4);
    expect(out[1]).toEqual(['', '', '']);
    expect(out[2][2]).toBe('=A3&B3');
    expect(out[3][2]).toBe('=SUM(A1:A4)');
  });

  it('deletes a row and points references at the gap to #REF', () => {
    const out = applyLineOp(sheet(), 'deleteRow', 1, 3);
    expect(out.length).toBe(2);
    // The old row 3 moved up and its own references followed.
    expect(out[1][2]).toBe('=SUM(A1:A2)');
    // A formula that referenced the deleted row would read #REF.
    expect(applyLineOp([['=A2', '', ''], ['x', '', '']], 'deleteRow', 1, 3)[0][0]).toBe('=#REF');
  });

  it('inserts a column and slides later references right', () => {
    const out = applyLineOp(sheet(), 'insertCol', 1, 3);
    expect(out[0][1]).toBe('');
    expect(out[0][3]).toBe('=A1&C1');
  });

  it('deletes a column, shifting the rest back', () => {
    const out = applyLineOp(sheet(), 'deleteCol', 0, 3);
    expect(out[0][0]).toBe('b1');
    // =A1&B1 lost its A1 and its B1 became A1.
    expect(out[0][1]).toBe('=#REF&A1');
  });

  it('ignores $ locks — the cell really did move', () => {
    expect(applyLineOp([['=$A$3', '', ''], ['', '', ''], ['x', '', '']], 'insertRow', 1, 3)[0][0]).toBe('=$A$4');
  });
});

describe('blockJump', () => {
  //  A    B    C
  //  1    x         <- row 0
  //  2                 row 1
  //            y       row 2  (gap in column A)
  //  4                 row 3
  const sheet = [['1', 'x', ''], ['2', '', ''], ['', '', 'y'], ['4', '', '']];

  it('runs to the end of a filled block', () => {
    expect(blockJump(sheet, {row: 0, col: 0}, 1, 0, 3)).toEqual({row: 1, col: 0});
  });

  it('skips the gap to the next filled cell', () => {
    expect(blockJump(sheet, {row: 1, col: 0}, 1, 0, 3)).toEqual({row: 3, col: 0});
  });

  it('runs to the sheet edge when nothing is ahead', () => {
    expect(blockJump(sheet, {row: 0, col: 1}, 1, 0, 3)).toEqual({row: 3, col: 1});
    expect(blockJump(sheet, {row: 3, col: 0}, 1, 0, 3)).toEqual({row: 3, col: 0});
  });

  it('stays put at the edge it is already on', () => {
    expect(blockJump(sheet, {row: 0, col: 0}, -1, 0, 3)).toEqual({row: 0, col: 0});
  });
});

describe('lastUsedCell', () => {
  it('finds the far corner of the used range', () => {
    expect(lastUsedCell([['a', '', ''], ['', '', 'b'], ['', '', '']], 3)).toEqual({row: 1, col: 2});
  });

  it('is the origin for an empty sheet', () => {
    expect(lastUsedCell([['', ''], ['', '']], 2)).toEqual({row: 0, col: 0});
  });
});

describe('dataRegion', () => {
  const sheet = [
    ['name', 'qty', ''],
    ['b', '2', ''],
    ['a', '1', ''],
    ['', '', ''], // blank line: the boundary
    ['other', '9', '']
  ];

  it('grows to the surrounding block and stops at the blank line', () => {
    expect(dataRegion(sheet, {row: 1, col: 0}, 3)).toEqual({top: 0, bottom: 2, left: 0, right: 1});
  });

  it('finds the block below the blank line on its own', () => {
    expect(dataRegion(sheet, {row: 4, col: 0}, 3)).toEqual({top: 4, bottom: 4, left: 0, right: 1});
  });

  it('is just the cell when everything around it is empty', () => {
    expect(dataRegion([['', ''], ['', '']], {row: 0, col: 0}, 2)).toEqual({top: 0, bottom: 0, left: 0, right: 0});
  });
});

describe('looksLikeHeader', () => {
  const region = {top: 0, bottom: 2, left: 0, right: 1};

  it('spots a text row above numbers', () => {
    expect(looksLikeHeader([['name', 'qty'], ['b', '2'], ['a', '1']], region)).toBe(true);
  });

  it('says no when the top row already holds a number', () => {
    expect(looksLikeHeader([['name', '3'], ['b', '2'], ['a', '1']], region)).toBe(false);
  });

  it('says no when nothing below is numeric', () => {
    expect(looksLikeHeader([['name', 'qty'], ['b', 'x'], ['a', 'y']], region)).toBe(false);
  });
});

describe('sortRegion', () => {
  const run = (rows: string[][], byCol: number, dir: 'asc' | 'desc', hasHeader: boolean) =>
    sortRegion(rows, dataRegion(rows, {row: 0, col: 0}, rows[0].length), byCol, dir, hasHeader, evaluateGrid(rows));

  it('sorts rows by a column and keeps each record together', () => {
    const out = run([['name', 'qty'], ['b', '2'], ['a', '1'], ['c', '3']], 0, 'asc', true);
    expect(out.map(r => r.join(','))).toEqual(['name,qty', 'a,1', 'b,2', 'c,3']);
  });

  it('sorts descending', () => {
    const out = run([['name', 'qty'], ['b', '2'], ['a', '1']], 1, 'desc', true);
    expect(out.map(r => r[0])).toEqual(['name', 'b', 'a']);
  });

  it('orders numbers before text and leaves blanks last either way', () => {
    // The second column keeps every row non-empty; a fully blank row would end
    // the region and cut the sort short.
    const rows = [['x', 'p'], ['10', 'q'], ['abc', 'r'], ['', 's'], ['2', 't']];
    expect(run(rows, 0, 'asc', false).map(r => r[0])).toEqual(['2', '10', 'abc', 'x', '']);
    expect(run(rows, 0, 'desc', false).map(r => r[0])).toEqual(['x', 'abc', '10', '2', '']);
  });

  it('stops at a blank row instead of dragging the next table into the sort', () => {
    const rows = [['b'], ['a'], [''], ['z'], ['y']];
    const out = sortRegion(rows, dataRegion(rows, {row: 0, col: 0}, 1), 0, 'asc', false, evaluateGrid(rows));
    expect(out.map(r => r[0])).toEqual(['a', 'b', '', 'z', 'y']);
  });

  it('sorts a formula column by what it shows', () => {
    const rows = [['3', '=A1*2'], ['1', '=A2*2'], ['2', '=A3*2']];
    const out = run(rows, 1, 'asc', false);
    expect(out.map(r => r[0])).toEqual(['1', '2', '3']);
    // Each formula followed its own row, so it still doubles its neighbour.
    expect(evaluateGrid(out).map(r => r[1])).toEqual([2, 4, 6]);
  });

  it('leaves the sheet alone when there is nothing to reorder', () => {
    const rows = [['only']];
    expect(run(rows, 0, 'asc', false)).toEqual(rows);
  });
});

describe('selectionStats', () => {
  const values = [[1, 2, 'x'], [3, '', 'y'], [10, 20, '']];
  const all = {top: 0, bottom: 2, left: 0, right: 2};

  it('counts filled cells and sums only the numbers', () => {
    expect(selectionStats(values, all)).toEqual({count: 7, numeric: 5, sum: 36, min: 1, max: 20});
  });

  it('skips rows a filter is hiding', () => {
    expect(selectionStats(values, all, r => r !== 2)).toEqual({count: 5, numeric: 3, sum: 6, min: 1, max: 3});
  });

  it('reports zeroes rather than Infinity when nothing is numeric', () => {
    expect(selectionStats([['a', 'b']], {top: 0, bottom: 0, left: 0, right: 1}))
      .toEqual({count: 2, numeric: 0, sum: 0, min: 0, max: 0});
  });
});

describe('trimSheet', () => {
  it('drops the empty tail so a blank sheet costs nothing to store', () => {
    expect(trimSheet([['', ''], ['', '']])).toEqual([]);
  });

  it('keeps everything up to the last filled cell', () => {
    expect(trimSheet([['a', '', ''], ['', '', ''], ['', 'b', ''], ['', '', '']]))
      .toEqual([['a'], [], ['', 'b']]);
  });

  it('leaves a full sheet alone', () => {
    expect(trimSheet([['a', 'b'], ['c', 'd']])).toEqual([['a', 'b'], ['c', 'd']]);
  });
});
