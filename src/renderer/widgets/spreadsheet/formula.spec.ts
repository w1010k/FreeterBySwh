/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {colName, evaluateGrid, translateRefs} from './formula';

/** Evaluates a one-row grid and returns the last cell — the formula under test. */
function evalOne(formula: string, before: string[] = []) {
  return evaluateGrid([[...before, formula]])[0][before.length];
}

describe('evaluateGrid', () => {
  it('leaves non-formula text untouched, including leading zeros', () => {
    expect(evaluateGrid([['007', 'hi', '']])[0]).toEqual(['007', 'hi', '']);
  });

  it('evaluates arithmetic with correct precedence and associativity', () => {
    expect(evalOne('=1+2*3')).toBe(7);
    expect(evalOne('=(1+2)*3')).toBe(9);
    expect(evalOne('=2^3^2')).toBe(512); // right-associative
    expect(evalOne('=-2+10')).toBe(8);
  });

  it('binds unary minus tighter than ^, as Excel and Sheets do', () => {
    expect(evalOne('=-2^2')).toBe(4);
    expect(evalOne('=2^-1')).toBe(0.5);
    expect(evalOne('=0-2^2')).toBe(-4); // binary minus keeps normal precedence
  });

  it('rejects columns past the addressable limit instead of aliasing another cell', () => {
    // ZZZ is column 18278, beyond Excel's 16384 — and beyond what the
    // evaluation cache can pack without colliding with the next row.
    expect(evalOne('=ZZZ1')).toBe('#REF');
    expect(evaluateGrid([['9'], [], ['=A1']])[2][0]).toBe(9);
  });

  it('reads a referenced numeric cell as a number, text as text', () => {
    expect(evalOne('=A1', ['9'])).toBe(9);
    expect(evalOne('=A1', ['abc'])).toBe('abc');
    expect(evalOne('=A1', [''])).toBe('');
  });

  it('resolves cell references and ranges', () => {
    // A1=1 B1=2 C1=3, D1 sums the range
    expect(evalOne('=SUM(A1:C1)', ['1', '2', '3'])).toBe(6);
    expect(evalOne('=A1+B1', ['4', '5'])).toBe(9);
  });

  it('ignores blanks and text when aggregating', () => {
    expect(evalOne('=SUM(A1:C1)', ['1', '', 'abc'])).toBe(1);
    expect(evalOne('=COUNT(A1:C1)', ['1', '', 'abc'])).toBe(1);
    expect(evalOne('=AVERAGE(A1:C1)', ['2', '', '4'])).toBe(3);
  });

  it('supports IF and string concatenation', () => {
    expect(evalOne('=IF(A1>10,"big","small")', ['11'])).toBe('big');
    expect(evalOne('=IF(A1>10,"big","small")', ['9'])).toBe('small');
    expect(evalOne('=A1&"-"&B1', ['x', 'y'])).toBe('x-y');
  });

  it('reports errors instead of throwing or hanging', () => {
    expect(evalOne('=1/0')).toBe('#DIV/0');
    expect(evalOne('=VLOOKUP(1)')).toBe('#NAME');
    expect(evalOne('=1+')).toBe('#ERROR');
    expect(evalOne('=A1*2', ['abc'])).toBe('#VALUE');
  });

  it('detects circular references, direct and indirect', () => {
    expect(evaluateGrid([['=A1']])[0][0]).toBe('#CIRC');
    // A1 -> B1 -> A1
    expect(evaluateGrid([['=B1', '=A1']])[0]).toEqual(['#CIRC', '#CIRC']);
  });

  it('propagates an error through dependent cells', () => {
    // A1 errors, B1 references it and must not report a different error
    expect(evaluateGrid([['=1/0', '=A1+1']])[0][1]).toBe('#DIV/0');
  });

  it('evaluates references across rows', () => {
    expect(evaluateGrid([['5'], ['=A1*2']])[1][0]).toBe(10);
  });
});

describe('colName', () => {
  it('maps indexes to spreadsheet column letters', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(colName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('absolute references', () => {
  it('evaluates $-locked references like plain ones', () => {
    expect(evaluateGrid([['5', '=$A$1*2', '=$A1+A$1']])[0]).toEqual(['5', 10, 10]);
  });

  it('rejects a stray $ that is not part of a reference', () => {
    expect(evaluateGrid([['=$+1']])[0][0]).toBe('#ERROR');
  });
});

describe('translateRefs', () => {
  it('leaves plain values and unmoved formulas alone', () => {
    expect(translateRefs('42', 1, 1)).toBe('42');
    expect(translateRefs('=A1', 0, 0)).toBe('=A1');
  });

  it('shifts relative references by the move', () => {
    expect(translateRefs('=A1+B2', 1, 0)).toBe('=A2+B3');
    expect(translateRefs('=A1+B2', 0, 2)).toBe('=C1+D2');
    expect(translateRefs('=SUM(A1:A3)', 2, 0)).toBe('=SUM(A3:A5)');
  });

  it('keeps $-locked halves pinned', () => {
    expect(translateRefs('=$A$1', 3, 3)).toBe('=$A$1');
    expect(translateRefs('=$A1', 2, 5)).toBe('=$A3');
    expect(translateRefs('=A$1', 2, 1)).toBe('=B$1');
  });

  it('does not touch function names or text literals', () => {
    expect(translateRefs('=SUM(A1)&"A1"', 1, 0)).toBe('=SUM(A2)&"A1"');
  });

  it('bakes in #REF when a reference falls off the sheet', () => {
    expect(translateRefs('=A1', -1, 0)).toBe('=#REF');
    // ...and that error then propagates when the cell is evaluated.
    expect(evaluateGrid([['=#REF+1']])[0][0]).toBe('#REF');
  });
});
