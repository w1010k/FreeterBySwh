/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * A deliberately tiny spreadsheet formula engine: arithmetic, cell/range
 * references and a handful of aggregates. That covers what a Freeter tile is
 * for; anything beyond it surfaces as `#ERROR` rather than a silently wrong
 * number. Adding a function means one entry in FUNCS, nothing else.
 *
 * ponytail: hand-rolled instead of pulling in a formula library — those ship
 * 300+ functions (and a few MB) for the six people actually use here. If real
 * .xlsx workbooks ever need to evaluate, swap this for HyperFormula.
 */

export type CellValue = string | number;
export type Grid = ReadonlyArray<ReadonlyArray<string>>;
/** A cell lookup, by zero-based column and row. */
export type CellGetter = (col: number, row: number) => CellValue;

/** Guards a runaway range like `A1:A1000000` from freezing the renderer. */
const MAX_RANGE_CELLS = 100000;
/** Highest addressable column (Excel's limit) — also bounds the cache key packing. */
const MAX_COLS = 16384;

/** Carries a spreadsheet-style error code (`#VALUE`, `#CIRC`, …) up the stack. */
class FormulaError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** An error already stored in a cell propagates instead of being coerced. */
function isErrorValue(v: CellValue): boolean {
  return typeof v === 'string' && v.startsWith('#');
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'err'; v: string }
  | { t: 'op'; v: string }
  | { t: 'punc'; v: '(' | ')' | ',' | ':' };

// Longest-first so `<=` wins over `<`.
const OPERATORS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '=', '<', '>'];
/**
 * A cell reference, with optional `$` locks: `A1`, `$A1`, `A$1`, `$A$1`.
 * A `$` freezes that half when the formula is copied or filled elsewhere.
 */
const REF_RE = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}/;
/** An error code written into a formula, e.g. by a reference that went out of range. */
const ERROR_RE = /^#[A-Z]+(\/0)?/;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) {
        throw new FormulaError('#ERROR');
      }
      out.push({t: 'str', v: src.slice(i + 1, end)});
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        j++;
      }
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) {
        throw new FormulaError('#ERROR');
      }
      out.push({t: 'num', v: n});
      i = j;
      continue;
    }
    if (c === '#') {
      // An error code that a reference rewrite left behind; it evaluates to itself.
      const m = ERROR_RE.exec(src.slice(i));
      if (!m) {
        throw new FormulaError('#ERROR');
      }
      out.push({t: 'err', v: m[0]});
      i += m[0].length;
      continue;
    }
    if (c === '$' || /[A-Za-z_]/.test(c)) {
      const ref = REF_RE.exec(src.slice(i));
      const after = ref ? src[i + ref[0].length] : undefined;
      // `LOG10(` looks like a reference until the paren; a name followed by `(`
      // is always a function call. Excel resolves the ambiguity the same way.
      if (ref && after !== '(' && !/[A-Za-z0-9_]/.test(after ?? '')) {
        out.push({t: 'ref', v: ref[0]});
        i += ref[0].length;
        continue;
      }
      if (c === '$') {
        throw new FormulaError('#ERROR');
      }
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) {
        j++;
      }
      out.push({t: 'ident', v: src.slice(i, j)});
      i = j;
      continue;
    }
    if (c === '(' || c === ')' || c === ',' || c === ':') {
      out.push({t: 'punc', v: c});
      i++;
      continue;
    }
    const op = OPERATORS.find(o => src.startsWith(o, i));
    if (!op) {
      throw new FormulaError('#ERROR');
    }
    out.push({t: 'op', v: op});
    i += op.length;
  }
  return out;
}

/**
 * `A1` -> `{col: 0, row: 0}`. Letters are base-26 with no zero digit.
 * `$` locks are stripped here — they only matter when a formula is moved.
 */
export function parseRef(ref: string): { col: number; row: number } {
  const m = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(ref);
  if (!m) {
    throw new FormulaError('#REF');
  }
  let col = 0;
  for (const ch of m[1].toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  const row = Number(m[2]);
  // MAX_COLS is Excel's own column limit, and keeps the packed cache key in
  // evaluateGrid collision-free (col must stay below its row multiplier).
  if (col < 1 || row < 1 || col > MAX_COLS) {
    throw new FormulaError('#REF');
  }
  return {col: col - 1, row: row - 1};
}

/** `0` -> `A`, `26` -> `AA`. Inverse of the letter half of parseRef. */
export function colName(col: number): string {
  let n = col + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A parsed operand: a single value, or a range flattened into a list. */
type Operand = CellValue | CellValue[];

function toNum(v: Operand): number {
  if (Array.isArray(v)) {
    throw new FormulaError('#VALUE');
  }
  if (typeof v === 'number') {
    return v;
  }
  if (isErrorValue(v)) {
    throw new FormulaError(v);
  }
  const s = v.trim();
  if (s === '') {
    return 0;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new FormulaError('#VALUE');
  }
  return n;
}

function toStr(v: Operand): string {
  if (Array.isArray(v)) {
    throw new FormulaError('#VALUE');
  }
  if (isErrorValue(v)) {
    throw new FormulaError(String(v));
  }
  return typeof v === 'number' ? String(v) : v;
}

/** Flattens args and keeps only the numeric cells, the way Excel aggregates do. */
function numericArgs(args: Operand[]): number[] {
  const out: number[] = [];
  for (const a of args) {
    for (const v of Array.isArray(a) ? a : [a]) {
      if (isErrorValue(v)) {
        throw new FormulaError(String(v));
      }
      if (typeof v === 'number') {
        out.push(v);
      } else if (v.trim() !== '' && Number.isFinite(Number(v))) {
        // Text cells that happen to hold a number count; blanks and words don't.
        out.push(Number(v));
      }
    }
  }
  return out;
}

const FUNCS: Record<string, (args: Operand[]) => CellValue> = {
  SUM: args => numericArgs(args).reduce((a, b) => a + b, 0),
  AVERAGE: args => {
    const ns = numericArgs(args);
    if (ns.length === 0) {
      throw new FormulaError('#DIV/0');
    }
    return ns.reduce((a, b) => a + b, 0) / ns.length;
  },
  MIN: args => {
    const ns = numericArgs(args);
    return ns.length ? Math.min(...ns) : 0;
  },
  MAX: args => {
    const ns = numericArgs(args);
    return ns.length ? Math.max(...ns) : 0;
  },
  COUNT: args => numericArgs(args).length,
  ABS: args => Math.abs(toNum(args[0])),
  ROUND: args => {
    const f = 10 ** (args.length > 1 ? toNum(args[1]) : 0);
    return Math.round(toNum(args[0]) * f) / f;
  },
  IF: args => {
    if (args.length < 2) {
      throw new FormulaError('#ERROR');
    }
    const cond = args[0];
    const truthy = Array.isArray(cond)
      ? cond.length > 0
      : typeof cond === 'number'
        ? cond !== 0
        : cond.trim() !== '' && cond.toUpperCase() !== 'FALSE';
    const picked = truthy ? args[1] : args.length > 2 ? args[2] : '';
    return Array.isArray(picked) ? toStr(picked[0] ?? '') : picked;
  }
};
FUNCS.AVG = FUNCS.AVERAGE;

/** Every function name the engine knows, for the editor's autocomplete. */
export const FUNCTION_NAMES = Object.keys(FUNCS).sort();

/** Recursive-descent parser that evaluates as it goes — there's no AST to keep. */
class Parser {
  private pos = 0;

  constructor(private readonly toks: Token[], private readonly get: CellGetter) {
  }

  parse(): CellValue {
    const v = this.expr();
    if (this.pos < this.toks.length) {
      throw new FormulaError('#ERROR');
    }
    return Array.isArray(v) ? toStr(v[0] ?? '') : v;
  }

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }

  private eatOp(...ops: string[]): string | undefined {
    const t = this.peek();
    if (t && t.t === 'op' && ops.includes(t.v)) {
      this.pos++;
      return t.v;
    }
    return undefined;
  }

  private eatPunc(p: '(' | ')' | ',' | ':'): boolean {
    const t = this.peek();
    if (t && t.t === 'punc' && t.v === p) {
      this.pos++;
      return true;
    }
    return false;
  }

  // Lowest precedence: comparisons yield the strings Excel shows for booleans.
  private expr(): Operand {
    let left = this.concat();
    for (; ;) {
      const op = this.eatOp('=', '<>', '<', '>', '<=', '>=');
      if (!op) {
        return left;
      }
      const right = this.concat();
      left = this.compare(op, left, right) ? 'TRUE' : 'FALSE';
    }
  }

  // Numeric when both sides look numeric, lexicographic otherwise — the rule
  // spreadsheets use so `="a"<"b"` and `=1<2` both behave.
  private compare(op: string, l: Operand, r: Operand): boolean {
    let a: number | string;
    let b: number | string;
    try {
      a = toNum(l);
      b = toNum(r);
    } catch {
      a = toStr(l);
      b = toStr(r);
    }
    switch (op) {
      case '=':
        return a === b;
      case '<>':
        return a !== b;
      case '<':
        return a < b;
      case '>':
        return a > b;
      case '<=':
        return a <= b;
      default:
        return a >= b;
    }
  }

  private concat(): Operand {
    let left = this.additive();
    while (this.eatOp('&')) {
      left = toStr(left) + toStr(this.additive());
    }
    return left;
  }

  private additive(): Operand {
    let left = this.multiplicative();
    for (; ;) {
      const op = this.eatOp('+', '-');
      if (!op) {
        return left;
      }
      const right = this.multiplicative();
      left = op === '+' ? toNum(left) + toNum(right) : toNum(left) - toNum(right);
    }
  }

  private multiplicative(): Operand {
    let left = this.power();
    for (; ;) {
      const op = this.eatOp('*', '/');
      if (!op) {
        return left;
      }
      const right = toNum(this.power());
      if (op === '/') {
        if (right === 0) {
          throw new FormulaError('#DIV/0');
        }
        left = toNum(left) / right;
      } else {
        left = toNum(left) * right;
      }
    }
  }

  private power(): Operand {
    const base = this.signed();
    if (this.eatOp('^')) {
      // Right-associative, so `2^3^2` is 2^(3^2).
      return toNum(base) ** toNum(this.power());
    }
    return base;
  }

  // Sign binds tighter than `^`, matching Excel and Sheets: `=-2^2` is 4,
  // not -4. That's why the sign is consumed below power(), not above it.
  private signed(): Operand {
    const op = this.eatOp('-', '+');
    if (op) {
      const v = toNum(this.signed());
      return op === '-' ? -v : v;
    }
    return this.primary();
  }

  private primary(): Operand {
    const t = this.peek();
    if (!t) {
      throw new FormulaError('#ERROR');
    }
    if (t.t === 'num' || t.t === 'str') {
      this.pos++;
      return t.v;
    }
    if (t.t === 'err') {
      // An error baked into the formula text propagates as that error.
      throw new FormulaError(t.v);
    }
    if (t.t === 'punc' && t.v === '(') {
      this.pos++;
      const v = this.expr();
      if (!this.eatPunc(')')) {
        throw new FormulaError('#ERROR');
      }
      return v;
    }
    if (t.t === 'ref') {
      this.pos++;
      const from = parseRef(t.v);
      if (this.eatPunc(':')) {
        const next = this.peek();
        if (!next || next.t !== 'ref') {
          throw new FormulaError('#REF');
        }
        this.pos++;
        return this.range(from, parseRef(next.v));
      }
      // A referenced cell holds raw text; a numeric-looking one becomes a number
      // so `=A1` right-aligns and reads as a number, the way Excel shows it.
      const v = this.get(from.col, from.row);
      return typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
    }
    if (t.t === 'ident') {
      this.pos++;
      const name = t.v.toUpperCase();
      if (name === 'TRUE' || name === 'FALSE') {
        return name;
      }
      const fn = FUNCS[name];
      if (!fn || !this.eatPunc('(')) {
        throw new FormulaError('#NAME');
      }
      const args: Operand[] = [];
      if (!this.eatPunc(')')) {
        do {
          args.push(this.expr());
        } while (this.eatPunc(','));
        if (!this.eatPunc(')')) {
          throw new FormulaError('#ERROR');
        }
      }
      return fn(args);
    }
    throw new FormulaError('#ERROR');
  }

  private range(a: { col: number; row: number }, b: { col: number; row: number }): CellValue[] {
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_RANGE_CELLS) {
      throw new FormulaError('#REF');
    }
    const out: CellValue[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        out.push(this.get(c, r));
      }
    }
    return out;
  }
}

/**
 * Evaluates one cell's raw text. Non-formula text is returned untouched, so the
 * grid keeps whatever the user typed (including leading zeros).
 */
function evaluateCell(raw: string, get: CellGetter): CellValue {
  if (!raw.startsWith('=')) {
    return raw;
  }
  return new Parser(tokenize(raw.slice(1)), get).parse();
}

/**
 * Evaluates the whole grid, resolving references lazily so each cell is
 * computed at most once. A cell that re-enters itself (directly or through a
 * chain) resolves to `#CIRC` instead of blowing the stack.
 *
 * ponytail: recomputes every cell on each call rather than tracking a
 * dependency graph — fine up to a few thousand cells. Build the graph only if a
 * real sheet starts to lag.
 */
export function evaluateGrid(grid: Grid): CellValue[][] {
  const cache = new Map<number, CellValue>();
  const visiting = new Set<number>();
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  // Pack (col,row) into one number so the cache key needs no string building.
  const keyOf = (col: number, row: number) => row * MAX_COLS + col;

  const get: CellGetter = (col, row) => {
    const key = keyOf(col, row);
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    if (visiting.has(key)) {
      throw new FormulaError('#CIRC');
    }
    visiting.add(key);
    let val: CellValue;
    try {
      val = evaluateCell(grid[row]?.[col] ?? '', get);
    } catch (e) {
      val = e instanceof FormulaError ? e.code : '#ERROR';
    } finally {
      visiting.delete(key);
    }
    cache.set(key, val);
    return val;
  };

  return grid.map((row, r) => Array.from({length: Math.max(width, row.length)}, (_, c) => get(c, r)));
}

/** One half of a reference: its index, and whether a `$` pins it. */
interface RefPart {
  index: number;
  locked: boolean
}

/** Splits `$B$3` into its column and row parts, or null if it isn't a reference. */
function splitRef(ref: string): { col: RefPart; row: RefPart } | null {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})$/.exec(ref);
  if (!m) {
    return null;
  }
  let col = 0;
  for (const ch of m[2].toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return {
    col: {index: col - 1, locked: m[1] === '$'},
    row: {index: Number(m[4]) - 1, locked: m[3] === '$'}
  };
}


/** Rewrites one reference token, or returns null to leave it as written. */
type RefRewrite = (col: RefPart, row: RefPart) => string | null;

/**
 * Walks a formula and hands every cell reference to `rewrite`, leaving text
 * literals and function names alone. Shared by the move and insert/delete
 * rewrites so they can't drift apart on what counts as a reference.
 */
function mapRefs(text: string, rewrite: RefRewrite): string {
  if (!text.startsWith('=')) {
    return text;
  }
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      const stop = end < 0 ? text.length : end + 1;
      out += text.slice(i, stop);
      i = stop;
      continue;
    }
    const m = REF_RE.exec(text.slice(i));
    const after = m ? text[i + m[0].length] : undefined;
    const before = text[i - 1];
    const parts = m
    && after !== '('
    && !/[A-Za-z0-9_]/.test(after ?? '')
    && !/[A-Za-z0-9_$]/.test(before ?? '')
      ? splitRef(m[0])
      : null;
    if (!parts || !m) {
      out += c;
      i++;
      continue;
    }
    out += rewrite(parts.col, parts.row) ?? m[0];
    i += m[0].length;
  }
  return out;
}

/** Renders a reference back to text, keeping whichever halves were locked. */
function refText(col: RefPart, row: RefPart, colIndex: number, rowIndex: number): string {
  return colIndex < 0 || rowIndex < 0 || colIndex >= MAX_COLS
    ? '#REF'
    : `${col.locked ? '$' : ''}${colName(colIndex)}${row.locked ? '$' : ''}${rowIndex + 1}`;
}

/**
 * Rewrites references after rows or columns are inserted or removed.
 *
 * `count` is positive for an insert and negative for a delete. A reference to a
 * line that was deleted becomes `#REF` — it has nowhere left to point — while
 * references past the change slide by the same amount. Unlike a move, `$` locks
 * do NOT protect a reference here: the cell genuinely went somewhere else.
 */
export function adjustRefs(text: string, axis: 'row' | 'col', at: number, count: number): string {
  return mapRefs(text, (col, row) => {
    const part = axis === 'row' ? row : col;
    if (part.index < at) {
      return null; // Before the change: untouched.
    }
    if (count < 0 && part.index < at - count) {
      return '#REF'; // Inside the removed span.
    }
    const shifted = part.index + count;
    return axis === 'row'
      ? refText(col, row, col.index, shifted)
      : refText(col, row, shifted, row.index);
  });
}

/**
 * Rewrites the references in a formula as if it moved by `dRow`/`dCol` cells —
 * what a spreadsheet does when you copy, fill, or drag a formula elsewhere.
 * `$`-locked halves stay put. A reference pushed off the sheet becomes `#REF`,
 * the way Excel bakes the error into the formula text rather than shifting to
 * a wrong cell.
 */
export function translateRefs(text: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) {
    return text;
  }
  return mapRefs(text, (col, row) => refText(
    col,
    row,
    col.locked ? col.index : col.index + dCol,
    row.locked ? row.index : row.index + dRow
  ));
}
