/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {adjustRefs, CellValue, colName, FUNCTION_NAMES, translateRefs} from './formula';
import {DECIMALS_AUTO, Settings} from './settings';

/** One sheet row: raw cell text, indexed by column. Formulas are stored as typed. */
export type Row = string[];

export interface Cursor {
  row: number;
  col: number
}

/** Anchor plus focus corner; the selected rectangle is the box between them. */
export interface Selection {
  anchor: Cursor;
  focus: Cursor
}

export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number
}

/** The rectangle a selection covers, normalised so top/left are the smaller. */
export function selectionBox({anchor, focus}: Selection): Box {
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col)
  };
}

export const inBox = (b: Box, row: number, col: number) =>
  row >= b.top && row <= b.bottom && col >= b.left && col <= b.right;

/**
 * Builds the display formatter for the current settings. Only numbers are
 * touched — text and error codes pass through untouched.
 */
export function makeFormatter({decimals, thousands}: Pick<Settings, 'decimals' | 'thousands'>) {
  return (v: CellValue): string => {
    if (typeof v !== 'number') {
      return v;
    }
    if (!Number.isFinite(v)) {
      return '#NUM';
    }
    if (decimals === DECIMALS_AUTO) {
      // Trim float noise (`=0.1+0.2`) without turning integers into `1.00`.
      const trimmed = Math.round(v * 1e10) / 1e10;
      return thousands ? trimmed.toLocaleString('en-US', {maximumFractionDigits: 10}) : String(trimmed);
    }
    return v.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: thousands
    });
  };
}

/**
 * Whether a cell reads as a number — a computed number, or text that is one.
 * Typed values stay raw text (so `007` keeps its zeros), but they still align
 * right and stay inside their column like any other number.
 */
export function isNumeric(v: CellValue): boolean {
  return typeof v === 'number' || (v.trim() !== '' && Number.isFinite(Number(v)));
}

/** A1-style name for a cell, used by the formula bar and reference picking. */
export const refName = ({row, col}: Cursor) => `${colName(col)}${row + 1}`;

/**
 * True when a cell reference may be inserted at the end of `text` — i.e. the
 * formula ends with an operator, an opening paren, a comma, or the leading `=`.
 * That's the same test Excel uses to decide whether an arrow key picks a cell
 * or just moves the caret.
 */
export function acceptsRef(text: string): boolean {
  return text.startsWith('=') && /[=+\-*/^&(,<>:]\s*$/.test(text);
}

/** Strips a reference the previous arrow press appended, so it can be replaced. */
export function dropTrailingRef(text: string): string {
  return text.replace(/[A-Za-z]{1,3}[0-9]{1,7}$/, '');
}

/** Pads every row out to `cols`, never truncating — see the note in the widget. */
export function normalize(rows: Row[], cols: number): Row[] {
  return rows.map(row => Array.from({length: Math.max(cols, row.length)}, (_, c) => row[c] ?? ''));
}

/**
 * Raw text of a rectangle as TSV, the format Excel and Sheets exchange.
 * `visible` lets a filtered sheet copy only the rows the user can see.
 */
export function toTsv(rows: Row[], b: Box, visible: (r: number) => boolean = () => true): string {
  const out: string[] = [];
  for (let r = b.top; r <= b.bottom; r++) {
    if (!visible(r)) {
      continue;
    }
    const line: string[] = [];
    for (let c = b.left; c <= b.right; c++) {
      line.push(rows[r]?.[c] ?? '');
    }
    out.push(line.join('\t'));
  }
  return out.join('\n');
}

/**
 * Splits pasted TSV into a grid. Trailing newlines are dropped so a copy from
 * Excel (which ends with one) doesn't add a blank row.
 */
export function fromTsv(text: string): string[][] {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n').map(line => line.split('\t'));
}

/**
 * Writes `patch` into `rows` with its top-left at `at`, growing the sheet as
 * needed. Returns a new array; the input is untouched.
 */
export function applyPatch(
  rows: Row[],
  at: Cursor,
  patch: string[][],
  cols: number,
  visible: (r: number) => boolean = () => true
): Row[] {
  const next = rows.map(r => [...r]);
  // Each pasted line lands on the next visible row, so a filtered sheet takes
  // the paste into the rows on screen rather than into what it is hiding.
  const targets: number[] = [];
  for (let r = at.row; targets.length < patch.length; r++) {
    while (next.length <= r) {
      next.push([]);
    }
    if (visible(r)) {
      targets.push(r);
    }
  }
  patch.forEach((line, r) => {
    const target = next[targets[r]];
    line.forEach((v, c) => {
      const col = at.col + c;
      // Pasting wider than the sheet is not an error; the extra columns are
      // kept in the data and reappear if the user widens the sheet.
      if (col < Math.max(cols, target.length + line.length)) {
        target[col] = v;
      }
    });
  });
  return normalize(next, cols);
}

/** Clears every cell in a rectangle, skipping rows a filter is hiding. */
export function clearBox(rows: Row[], b: Box, visible: (r: number) => boolean = () => true): Row[] {
  return rows.map((row, r) => {
    if (r < b.top || r > b.bottom || !visible(r)) {
      return row;
    }
    const next = [...row];
    for (let c = b.left; c <= b.right; c++) {
      next[c] = '';
    }
    return next;
  });
}

/**
 * The box a fill drag would cover: the source plus however far the pointer got,
 * snapped to one axis. Excel picks the dominant direction rather than filling
 * a corner, and so do we.
 */
export function fillTarget(src: Box, to: Cursor): Box {
  const down = to.row > src.bottom ? to.row - src.bottom : 0;
  const up = to.row < src.top ? src.top - to.row : 0;
  const right = to.col > src.right ? to.col - src.right : 0;
  const left = to.col < src.left ? src.left - to.col : 0;
  const vertical = Math.max(down, up);
  const horizontal = Math.max(right, left);
  if (vertical === 0 && horizontal === 0) {
    return src;
  }
  return vertical >= horizontal
    ? {...src, top: src.top - up, bottom: src.bottom + down}
    : {...src, left: src.left - left, right: src.right + right};
}

/** Numeric step of an arithmetic run, or null when the values aren't one. */
function seriesStep(values: string[]): number | null {
  if (values.length < 2 || values.some(v => v.trim() === '' || !Number.isFinite(Number(v)))) {
    return null;
  }
  const nums = values.map(Number);
  const step = nums[1] - nums[0];
  return nums.every((n, i) => i === 0 || Math.abs(n - (nums[0] + step * i)) < 1e-9) ? step : null;
}

/**
 * Fills `dst` from `src`, the way dragging the fill handle does.
 *
 * A run of numbers continues as a series (1,2 -> 3,4,5); anything else repeats,
 * with formulas rewritten for their new position. A lone number repeats rather
 * than counting up — that is Excel's default, and Ctrl-drag is what changes it.
 */
export function fillFrom(rows: Row[], src: Box, dst: Box, cols: number): Row[] {
  const next = normalize(rows, cols).map(r => [...r]);
  while (next.length <= dst.bottom) {
    next.push(Array.from({length: cols}, () => ''));
  }
  const vertical = dst.top < src.top || dst.bottom > src.bottom;
  const height = src.bottom - src.top + 1;
  const width = src.right - src.left + 1;

  for (let r = dst.top; r <= dst.bottom; r++) {
    for (let c = dst.left; c <= dst.right; c++) {
      if (inBox(src, r, c)) {
        continue; // The source keeps its own contents.
      }
      // Distance from the source's start, negative when filling backwards.
      const offset = vertical ? r - src.top : c - src.left;
      const span = vertical ? height : width;
      const step = ((offset % span) + span) % span;
      const srcRow = vertical ? src.top + step : r;
      const srcCol = vertical ? c : src.left + step;

      const line = vertical
        ? Array.from({length: height}, (_, i) => next[src.top + i]?.[c] ?? '')
        : Array.from({length: width}, (_, i) => next[r]?.[src.left + i] ?? '');
      const delta = seriesStep(line);
      if (delta !== null) {
        next[r][c] = String(Number(line[0]) + delta * offset);
        continue;
      }
      next[r][c] = translateRefs(next[srcRow]?.[srcCol] ?? '', r - srcRow, c - srcCol);
    }
  }
  return next;
}

/** What a row/column operation does to the sheet, before references are fixed. */
type LineOp = 'insertRow' | 'deleteRow' | 'insertCol' | 'deleteCol';

/**
 * Inserts or removes whole rows/columns and repairs every formula in the sheet.
 *
 * References past the change slide with it; references into a deleted line
 * become `#REF`. Repairing the whole sheet (not just the moved part) is the
 * point — a formula three screens away can still point here.
 */
export function applyLineOp(rows: Row[], op: LineOp, at: number, cols: number): Row[] {
  const grid = normalize(rows, cols).map(r => [...r]);
  const width = grid[0]?.length ?? cols;
  const isRow = op === 'insertRow' || op === 'deleteRow';
  const count = op === 'insertRow' || op === 'insertCol' ? 1 : -1;

  if (op === 'insertRow') {
    grid.splice(at, 0, Array.from({length: width}, () => ''));
  } else if (op === 'deleteRow') {
    grid.splice(at, 1);
  } else if (op === 'insertCol') {
    grid.forEach(row => row.splice(at, 0, ''));
  } else {
    grid.forEach(row => row.splice(at, 1));
  }

  return grid.map(row => row.map(cell => adjustRefs(cell, isRow ? 'row' : 'col', at, count)));
}

/**
 * Where Ctrl+Arrow lands, following Excel: from a filled cell, run to the last
 * filled cell before a gap; from a gap, jump to the next filled cell. Either
 * way you stop at the sheet's edge rather than falling off it.
 */
export function blockJump(rows: Row[], from: Cursor, dRow: number, dCol: number, cols: number): Cursor {
  const maxRow = rows.length - 1;
  const maxCol = cols - 1;
  const filled = (r: number, c: number) => (rows[r]?.[c] ?? '').trim() !== '';
  const inside = (r: number, c: number) => r >= 0 && r <= maxRow && c >= 0 && c <= maxCol;

  let {row, col} = from;
  const step = () => ({row: row + dRow, col: col + dCol});
  if (!inside(step().row, step().col)) {
    return {row, col};
  }

  const startFilled = filled(row, col);
  const nextFilled = filled(step().row, step().col);
  // Standing on data with data ahead: run to the end of that block.
  // Otherwise: skip the blanks and land on the next block's first cell.
  const wantFilled = startFilled && nextFilled;

  for (; ;) {
    const n = step();
    if (!inside(n.row, n.col)) {
      return {row, col};
    }
    row = n.row;
    col = n.col;
    if (wantFilled) {
      const after = step();
      if (!inside(after.row, after.col) || !filled(after.row, after.col)) {
        return {row, col};
      }
    } else if (filled(row, col)) {
      return {row, col};
    }
  }
}

/** Last row and column that hold anything, for Ctrl+End. */
export function lastUsedCell(rows: Row[], cols: number): Cursor {
  let row = 0;
  let col = 0;
  rows.forEach((line, r) => line.forEach((v, c) => {
    if (v.trim() !== '' && c < cols) {
      row = Math.max(row, r);
      col = Math.max(col, c);
    }
  }));
  return {row, col};
}

/**
 * Function names that could complete what is being typed at the end of a
 * formula. Empty unless the caret sits on a bare word right after `=`, an
 * operator, or an opening paren — the only places a function can start.
 */
export function completions(text: string): string[] {
  const m = /(?:^=|[=+\-*/^&(,<>:])\s*([A-Za-z]+)$/.exec(text);
  if (!m) {
    return [];
  }
  const word = m[1].toUpperCase();
  return FUNCTION_NAMES.filter(n => n.startsWith(word) && n !== word);
}

/** Replaces the half-typed name at the end of `text` with `name(`. */
export function applyCompletion(text: string, name: string): string {
  return text.replace(/[A-Za-z]+$/, `${name}(`);
}

/**
 * The contiguous block of data around a cell — Excel's "current region".
 *
 * Rows grow up and down while they hold anything at all, then columns grow out
 * while they hold anything within those rows. A blank line is the boundary,
 * which is what stops a sort from dragging an unrelated table along with it.
 */
export function dataRegion(rows: Row[], at: Cursor, cols: number): Box {
  const filled = (r: number, c: number) => (rows[r]?.[c] ?? '').trim() !== '';
  const rowHasData = (r: number) => Array.from({length: cols}, (_, c) => c).some(c => filled(r, c));

  let top = at.row;
  let bottom = at.row;
  while (top > 0 && rowHasData(top - 1)) {
    top--;
  }
  while (bottom < rows.length - 1 && rowHasData(bottom + 1)) {
    bottom++;
  }

  const colHasData = (c: number) => {
    for (let r = top; r <= bottom; r++) {
      if (filled(r, c)) {
        return true;
      }
    }
    return false;
  };
  let left = at.col;
  let right = at.col;
  while (left > 0 && colHasData(left - 1)) {
    left--;
  }
  while (right < cols - 1 && colHasData(right + 1)) {
    right++;
  }
  return {top, bottom, left, right};
}

/**
 * Guesses whether a region's first row is a header: all text across the top,
 * with at least one number underneath. Same heuristic Excel uses, and wrong in
 * the same cases — hence the menu toggle that overrides it.
 */
export function looksLikeHeader(rows: Row[], region: Box): boolean {
  if (region.bottom <= region.top) {
    return false;
  }
  let anyText = false;
  for (let c = region.left; c <= region.right; c++) {
    const head = rows[region.top]?.[c] ?? '';
    if (head.trim() !== '') {
      if (isNumeric(head)) {
        return false; // A number in the top row: not a header.
      }
      anyText = true;
    }
  }
  if (!anyText) {
    return false;
  }
  for (let c = region.left; c <= region.right; c++) {
    if (isNumeric(rows[region.top + 1]?.[c] ?? '')) {
      return true;
    }
  }
  return false;
}

/** Sort rank: numbers before text before blanks, as spreadsheets order them. */
function sortKey(v: CellValue): { rank: number; num: number; text: string } {
  if (typeof v === 'number') {
    return {rank: 0, num: v, text: ''};
  }
  if (v.trim() === '') {
    return {rank: 2, num: 0, text: ''};
  }
  return isNumeric(v)
    ? {rank: 0, num: Number(v), text: ''}
    : {rank: 1, num: 0, text: v.toLocaleLowerCase()};
}

/**
 * Sorts the rows of a region by one column, moving whole rows so the record
 * stays together. `values` is the evaluated sheet, so a formula column sorts by
 * what it shows rather than by its source text.
 *
 * Formulas inside the moved rows are rewritten for their new row, which keeps
 * `=B2*C2` pointing at its own record. Formulas outside the region are left
 * alone — they refer to positions, and those positions still exist.
 */
export function sortRegion(
  rows: Row[],
  region: Box,
  byCol: number,
  dir: 'asc' | 'desc',
  hasHeader: boolean,
  values: CellValue[][],
  visible: (r: number) => boolean = () => true
): Row[] {
  const first = region.top + (hasHeader ? 1 : 0);
  if (first >= region.bottom) {
    return rows;
  }
  // Filtered-out rows keep their slots; only the visible ones are shuffled
  // among the slots they already occupy, which is what a filtered sort means.
  const slots = Array.from({length: region.bottom - first + 1}, (_, i) => first + i).filter(visible);
  const order = [...slots];
  order.sort((a, b) => {
    const ka = sortKey(values[a]?.[byCol] ?? '');
    const kb = sortKey(values[b]?.[byCol] ?? '');
    // Blanks sink to the bottom whichever way the rest is sorted.
    if (ka.rank === 2 || kb.rank === 2) {
      return ka.rank === kb.rank ? 0 : ka.rank === 2 ? 1 : -1;
    }
    // Numbers before text ascending, text before numbers descending — the
    // ordering flips as a whole, exactly as Excel's Z-A does.
    if (ka.rank !== kb.rank) {
      return dir === 'asc' ? ka.rank - kb.rank : kb.rank - ka.rank;
    }
    const cmp = ka.rank === 0 ? ka.num - kb.num : ka.text.localeCompare(kb.text);
    return dir === 'asc' ? cmp : -cmp;
  });

  const next = rows.map(r => [...r]);
  order.forEach((from, i) => {
    const to = slots[i];
    for (let c = region.left; c <= region.right; c++) {
      next[to][c] = translateRefs(rows[from]?.[c] ?? '', to - from, 0);
    }
  });
  return next;
}

/** Condition kinds the column filter offers, split by what the column holds. */
export type FilterOp = 'gt' | 'ge' | 'lt' | 'le' | 'eq' | 'between' | 'contains' | 'startsWith';

export interface Filter {
  /**
   * Displayed values allowed through. Undefined means "every value passes",
   * which is different from an empty list (which lets nothing through).
   */
  values?: string[];
  cond?: { op: FilterOp; a: string; b?: string };
}

/** Filters keyed by column index. Absent means the column is unfiltered. */
export type Filters = Record<number, Filter>;

export const isFilterEmpty = (f: Filter | undefined) => !f || (f.values === undefined && !f.cond);

/** Whether one cell passes a column's filter. `shown` is what the user sees. */
export function passesFilter(shown: string, value: CellValue, f: Filter | undefined): boolean {
  if (isFilterEmpty(f)) {
    return true;
  }
  if (f!.values && !f!.values.includes(shown)) {
    return false;
  }
  const cond = f!.cond;
  if (!cond) {
    return true;
  }
  const num = typeof value === 'number' ? value : Number(value);
  const text = shown.toLocaleLowerCase();
  const a = cond.a.trim();
  switch (cond.op) {
    case 'gt':
      return num > Number(a);
    case 'ge':
      return num >= Number(a);
    case 'lt':
      return num < Number(a);
    case 'le':
      return num <= Number(a);
    case 'eq':
      return isNumeric(value) ? num === Number(a) : text === a.toLocaleLowerCase();
    case 'between':
      return num >= Number(a) && num <= Number(cond.b ?? a);
    case 'contains':
      return text.includes(a.toLocaleLowerCase());
    default:
      return text.startsWith(a.toLocaleLowerCase());
  }
}

/**
 * Rows the filters hide. Only rows inside the filtered region below its header
 * can be hidden — everything else stays put, so a filter never swallows data
 * that isn't part of the table.
 */
export function hiddenRows(
  display: string[][],
  values: CellValue[][],
  region: Box,
  firstDataRow: number,
  filters: Filters
): Set<number> {
  const cols = Object.keys(filters).map(Number).filter(c => !isFilterEmpty(filters[c]));
  const hidden = new Set<number>();
  if (cols.length === 0) {
    return hidden;
  }
  for (let r = firstDataRow; r <= region.bottom; r++) {
    const fails = cols.some(c => !passesFilter(display[r]?.[c] ?? '', values[r]?.[c] ?? '', filters[c]));
    if (fails) {
      hidden.add(r);
    }
  }
  return hidden;
}

/**
 * Distinct displayed values in a column, for the filter's checkbox list.
 * Rows hidden by *other* columns still contribute, which is what makes a
 * second filter's list show what is actually selectable.
 */
export function uniqueValues(display: string[][], region: Box, firstDataRow: number, col: number): string[] {
  const seen = new Set<string>();
  for (let r = firstDataRow; r <= region.bottom; r++) {
    seen.add(display[r]?.[col] ?? '');
  }
  return [...seen].sort((a, b) => {
    if (a === '') {
      return 1; // Blanks last, as in the sort order.
    }
    if (b === '') {
      return -1;
    }
    const na = Number(a);
    const nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
  });
}

/** What the status bar reports about the current selection. */
export interface SelectionStats {
  /** Cells holding anything at all, blanks excluded. */
  count: number;
  /** Of those, the ones that are numbers. */
  numeric: number;
  sum: number;
  min: number;
  max: number;
}

/**
 * Summarises the selected cells, skipping rows a filter is hiding so the
 * numbers match what is actually on screen.
 */
export function selectionStats(
  values: CellValue[][],
  b: Box,
  visible: (r: number) => boolean = () => true
): SelectionStats {
  let count = 0;
  let numeric = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let r = b.top; r <= b.bottom; r++) {
    if (!visible(r)) {
      continue;
    }
    for (let c = b.left; c <= b.right; c++) {
      const v = values[r]?.[c];
      if (v === undefined || v === '') {
        continue;
      }
      count++;
      if (isNumeric(v)) {
        const n = typeof v === 'number' ? v : Number(v);
        numeric++;
        sum += n;
        min = Math.min(min, n);
        max = Math.max(max, n);
      }
    }
  }
  return {count, numeric, sum, min: numeric ? min : 0, max: numeric ? max : 0};
}

/**
 * Drops trailing empty rows and cells before the sheet is written to disk.
 *
 * A blank sheet at the new defaults is 52,000 cells, which serialises to about
 * 160KB of `""` — written again on every edit. Loading pads it back out, so
 * nothing downstream can tell the difference.
 */
export function trimSheet(rows: Row[]): Row[] {
  let lastRow = -1;
  rows.forEach((row, r) => {
    if (row.some(v => v !== '')) {
      lastRow = r;
    }
  });
  return rows.slice(0, lastRow + 1).map(row => {
    let lastCol = -1;
    row.forEach((v, c) => {
      if (v !== '') {
        lastCol = c;
      }
    });
    return row.slice(0, lastCol + 1);
  });
}
