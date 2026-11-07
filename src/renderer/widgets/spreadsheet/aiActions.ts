/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult, WidgetAiAction, WidgetAiActionContext } from '@/widgets/appModules';
import { colName, parseRef } from '@/widgets/spreadsheet/formula';
import { Row, trimSheet } from '@/widgets/spreadsheet/grid';

/** What the mounted Spreadsheet widget exposes for AI actions (widget.tsx). */
export interface SpreadsheetAiApi {
  /** undefined while the sheet is loading. */
  get(): Row[] | undefined;
  /** Writes like a paste (one undo step, saved). false while the user is editing a cell. */
  set(row: number, col: number, values: string[][]): boolean;
}

// ponytail: a fixed cap per call; raise it if agents need bigger writes.
const MAX_CELLS = 10000;

function withSheet(ctx: WidgetAiActionContext, fn: (api: SpreadsheetAiApi, rows: Row[]) => AiRpcResult): AiRpcResult {
  const api = ctx.api.sheet as SpreadsheetAiApi | undefined;
  const rows = api?.get();
  if (!api || !rows) {
    return { ok: false, code: 'not_ready', message: 'The sheet is still loading' };
  }
  return fn(api, rows);
}

function parseCell(v: unknown): { row: number; col: number } | undefined {
  if (typeof v !== 'string') {
    return undefined;
  }
  try {
    return parseRef(v);
  } catch {
    return undefined;
  }
}

const isValues = (v: unknown): v is string[][] =>
  Array.isArray(v) && v.length > 0
  && v.every(line => Array.isArray(line) && line.every(cell => typeof cell === 'string'))
  && v.reduce((n: number, line: string[]) => n + line.length, 0) <= MAX_CELLS;

const getCells: WidgetAiAction<Record<string, never>> = {
  name: 'getCells',
  description: 'Read the used area of the sheet as raw cell text (formulas start with "="), rows from A1.',
  kind: 'read',
  properties: {},
  parse: () => ({}),
  describe: (_input, widgetName) => `Read spreadsheet "${widgetName}"`,
  run: (ctx) => withSheet(ctx, (_api, rows) => ({ ok: true, value: { rows: trimSheet(rows) } })),
};

const setCells: WidgetAiAction<{ row: number; col: number; values: string[][] }> = {
  name: 'setCells',
  description: `Write a block of cells starting at an A1 reference (e.g. "B2"); values is rows of strings, formulas start with "=". Max ${MAX_CELLS} cells.`,
  kind: 'write',
  properties: { cell: { type: 'string', pattern: '^[A-Za-z]+[0-9]+$' }, values: { type: 'array', items: { type: 'array', items: { type: 'string' } } } },
  required: ['cell', 'values'],
  parse: (input) => {
    const at = parseCell(input.cell);
    return at && isValues(input.values) ? { ...at, values: input.values } : undefined;
  },
  describe: ({ row, col, values }, widgetName) =>
    `Write ${values.length} rows x ${Math.max(...values.map(l => l.length))} columns at ${colName(col)}${row + 1} in spreadsheet "${widgetName}"`,
  run: (ctx, { row, col, values }) => withSheet(ctx, api => (api.set(row, col, values)
    ? { ok: true, value: null }
    : { ok: false, code: 'failed', message: 'The user is editing a cell; try again later' })),
};

export const spreadsheetAiActions: WidgetAiAction[] = [getCells, setCells] as WidgetAiAction[];
