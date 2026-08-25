/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {ReactComponent, WidgetMenuItem, WidgetReactComponentProps} from '@/widgets/appModules';
import {debounce} from '@/widgets/helpers';
import {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {FilterMenu} from './filterMenu';
import {CellValue, colName, evaluateGrid, translateRefs} from './formula';
import {
  acceptsRef,
  applyCompletion,
  applyLineOp,
  applyPatch,
  blockJump,
  Box,
  clearBox,
  completions,
  Cursor,
  dataRegion,
  dropTrailingRef,
  fillFrom,
  fillTarget,
  Filter,
  Filters,
  fromTsv,
  hiddenRows,
  isFilterEmpty,
  isNumeric,
  lastUsedCell,
  looksLikeHeader,
  makeFormatter,
  normalize,
  refName,
  Row,
  Selection,
  selectionBox,
  selectionStats,
  sortRegion,
  toTsv,
  trimSheet,
  uniqueValues
} from './grid';
import {MAX_COLS, Settings} from './settings';
import styles from './widget.module.scss';

const keySheet = 'sheet';
const keyWidths = 'colWidths';
const keyHeights = 'rowHeights';
const keyColDelta = 'colDelta';
const keyHeaderRow = 'headerRow';
const keyFilters = 'filters';
/** Extra rows kept rendered beyond the viewport so scrolling doesn't flicker. */
const OVERSCAN = 8;
const DEFAULT_COL_WIDTH = 90;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 18;
const GUTTER_WIDTH = 40;
/** Rows added per click of the button under the sheet. */
const ADD_ROWS = 10;
/**
 * Marks a copy as coming from this sheet, and records where it came from, so a
 * paste can rewrite relative references the way Excel does. Text copied from
 * anywhere else simply lacks it and is pasted verbatim.
 */
const CLIP_ORIGIN = 'text/x-freeter-sheet';
/** Marks the sheet body so the app's context menu knows what was right-clicked. */
const CELL_CONTEXT = 'cell';
/** How many edits can be taken back. Snapshots are small; this is generous. */
const HISTORY_LIMIT = 100;

/** Everything an undo has to put back. */
interface Snapshot {
  rows: Row[];
  widths: number[];
  heights: number[];
  colDelta: number;
  filters: Filters | null;
  sel: Selection;
}

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0]
};

/** Reads a persisted size array, treating anything odd as "use the default". */
function readSizes(text: string | undefined, min: number): number[] {
  try {
    const parsed = text ? JSON.parse(text) : null;
    return Array.isArray(parsed) ? parsed.map(v => (typeof v === 'number' && v >= min ? v : 0)) : [];
  } catch {
    return [];
  }
}

/**
 * A spreadsheet built directly on a `<table>` rather than on a grid library.
 *
 * The library version kept losing: it applied column widths only at mount, fed
 * cells a stale copy of the evaluated sheet, and shipped a resize-observer that
 * predates React 19. Here the layout is plain CSS — `<colgroup>` owns the column
 * widths, `<tr>` owns the row heights — and exactly one `<input>` exists at a
 * time, on the cell being edited.
 *
 * ponytail: no virtualisation. Every row is in the DOM, which is fine into the
 * low thousands of cells and is what a widget tile holds. If a sheet ever grows
 * past that, windowing the `<tbody>` is the upgrade, not another library.
 */
/** Nothing to suggest — a shared empty array keeps rows from re-rendering. */
const NO_HINTS: string[] = [];
/** Stand-in for the formatted grid while no filter needs one. */
const NO_DISPLAY: string[][] = [];

interface SheetRowProps {
  r: number;
  row: Row;
  values: CellValue[];
  format: (v: CellValue) => string;
  cols: number;
  height: number;
  headOn: boolean;
  /** Selected span in this row, or -1/-1 when the selection misses it. */
  selLeft: number;
  selRight: number;
  fillLeft: number;
  fillRight: number;
  activeCol: number;
  pickCol: number;
  handleCol: number;
  /** Only the row holding the open editor gets these; the rest see null. */
  draft: string | null;
  hints: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Columns that carry a filter button, or -1/-1 on every other row. */
  filterLeft: number;
  filterRight: number;
  filters: Filters | null;
  openFilterCol: number;
  menuValues: string[] | null;
  menuNumeric: boolean;
  onCellMouseDown: (e: ReactMouseEvent, r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onHeadMouseDown: (e: ReactMouseEvent, axis: 'col' | 'row', index: number) => void;
  onResize: (e: ReactMouseEvent, axis: 'x' | 'y', index: number) => void;
  onFillHandleDown: (e: ReactMouseEvent) => void;
  onOpenFilter: (c: number) => void;
  onApplyFilter: (c: number, next: Filter | undefined) => void;
  setDraft: (v: string | null) => void;
  setPick: (v: Cursor | null) => void;
}

/**
 * One rendered row.
 *
 * Memoised because it is the whole performance story: a thousand rows of fifty
 * columns is far too much to re-render on every keystroke, and windowing alone
 * still leaves ~1500 cells. Every prop here is a primitive or a value that only
 * changes when this row's appearance does, so an arrow key re-renders the two
 * rows that actually changed instead of all of them.
 */
const SheetRow = memo(function SheetRow(p: SheetRowProps) {
  const {r, row, values, format, cols} = p;
  return (
    <tr style={{height: p.height}}>
      <th
        className={`${styles['row-head']} ${p.headOn ? styles['head-on'] : ''}`}
        onMouseDown={e => p.onHeadMouseDown(e, 'row', r)}
        onMouseEnter={() => p.onCellMouseEnter(r, cols - 1)}
      >
        {r + 1}
        <span className={styles['grip-row']} onMouseDown={e => p.onResize(e, 'y', r)}/>
      </th>
      {Array.from({length: cols}, (_, c) => {
        const isActive = c === p.activeCol;
        const value = values?.[c] ?? '';
        const isErr = typeof value === 'string' && value.startsWith('#');
        const isNum = !isErr && isNumeric(value);
        // Long text spills over the next cell while that one is empty.
        const spills = !isNum && !isErr && value !== '' && (row?.[c + 1] ?? '') === '';
        const hasMenu = c === p.openFilterCol && p.menuValues !== null;
        return (
          <td
            key={c}
            className={[
              styles['cell'],
              c >= p.selLeft && c <= p.selRight ? styles['selected'] : '',
              isActive ? styles['active'] : '',
              c === p.pickCol ? styles['picked'] : '',
              c >= p.fillLeft && c <= p.fillRight ? styles['fill-preview'] : '',
              spills ? styles['spill'] : '',
              hasMenu ? styles['menu-open'] : '',
              isNum ? styles['num'] : '',
              isErr ? styles['err'] : ''
            ].join(' ')}
            data-widget-context={CELL_CONTEXT}
            onMouseDown={e => p.onCellMouseDown(e, r, c)}
            onMouseEnter={() => p.onCellMouseEnter(r, c)}
            onDoubleClick={() => p.setDraft(row?.[c] ?? '')}
          >
            {p.filters !== null && c >= p.filterLeft && c <= p.filterRight && (
              <button
                type='button'
                className={`${styles['filter-btn']} ${isFilterEmpty(p.filters[c]) ? '' : styles['filter-on']}`}
                title='Filter'
                onMouseDown={e => {
                  e.stopPropagation();
                  p.onOpenFilter(c);
                }}
              >
                {'▾'}
              </button>
            )}
            {hasMenu && (
              <FilterMenu
                values={p.menuValues!}
                numeric={p.menuNumeric}
                filter={p.filters?.[c]}
                onClose={() => p.onOpenFilter(-1)}
                onApply={next => p.onApplyFilter(c, next)}
              />
            )}
            {isActive && p.draft !== null
              ? (
                <>
                  <input
                    ref={p.inputRef}
                    className={styles['editor']}
                    value={p.draft}
                    onChange={e => {
                      p.setPick(null);
                      p.setDraft(e.target.value);
                    }}
                    onMouseDown={e => e.stopPropagation()}
                  />
                  {p.hints.length > 0 && (
                    <ul className={styles['hints']}>
                      {p.hints.map((name, i) => (
                        <li key={name}>
                          <button
                            type='button'
                            className={i === 0 ? styles['hint-first'] : undefined}
                            onMouseDown={ev => {
                              ev.preventDefault();
                              p.setDraft(applyCompletion(p.draft!, name));
                            }}
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )
              : <span className={styles['text']}>{format(value)}</span>}
            {c === p.handleCol && <span className={styles['fill-handle']} onMouseDown={p.onFillHandleDown}/>}
          </td>
        );
      })}
    </tr>
  )
});

function SpreadsheetWidget({widgetApi, settings}: WidgetReactComponentProps<Settings>) {
  const {dataStorage} = widgetApi;
  const {decimals, thousands, formulaBar, rowHeight} = settings;
  const startRows = settings.rows;

  const [rows, setRowsState] = useState<Row[]>([]);
  const [widths, setWidthsState] = useState<number[]>([]);
  const [heights, setHeightsState] = useState<number[]>([]);
  /** Columns added or removed since the setting, by insert/delete. */
  const [colDelta, setColDeltaState] = useState(0);
  /**
   * Whether a sort should hold the first row in place. Null means "work it out
   * from the data"; the menu toggle pins it either way once the user disagrees.
   */
  const [headerRow, setHeaderRowState] = useState<boolean | null>(null);
  const headerRowRef = useRef<boolean | null>(null);
  const setHeaderRow = useCallback((v: boolean | null) => {
    headerRowRef.current = v;
    setHeaderRowState(v);
  }, []);

  /** Per-column filters, and which column's dropdown is open. Null = filter off. */
  const [filters, setFiltersState] = useState<Filters | null>(null);
  const filtersRef = useRef<Filters | null>(null);
  const setFilters = useCallback((v: Filters | null) => {
    filtersRef.current = v;
    setFiltersState(v);
  }, []);
  const [openFilter, setOpenFilter] = useState<number | null>(null);

  // Mirrors again: history snapshots and the row/column operations all run from
  // event handlers, where the rendered values may be a beat behind.
  const rowsRef = useRef<Row[]>([]);
  const widthsRef = useRef<number[]>([]);
  const heightsRef = useRef<number[]>([]);
  const colDeltaRef = useRef(0);
  const setRows = useCallback((v: Row[]) => {
    rowsRef.current = v;
    setRowsState(v);
  }, []);
  const setWidths = useCallback((v: number[] | ((p: number[]) => number[])) => {
    setWidthsState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      widthsRef.current = next;
      return next;
    });
  }, []);
  const setHeights = useCallback((v: number[] | ((p: number[]) => number[])) => {
    setHeightsState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      heightsRef.current = next;
      return next;
    });
  }, []);
  const setColDelta = useCallback((v: number) => {
    colDeltaRef.current = v;
    setColDeltaState(v);
  }, []);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sel, setSelState] = useState<Selection>({anchor: {row: 0, col: 0}, focus: {row: 0, col: 0}});
  /** Draft text while a cell is open. Null means "not editing". */
  const [draft, setDraftState] = useState<string | null>(null);

  /**
   * Mirrors of the two states the key handler drives. A keystroke can arrive
   * before React has re-rendered the previous one (holding a key, or a fast
   * paste of input events), and the handler's closure would then still hold the
   * old draft — committing it twice and dropping the new character. Reading
   * these refs makes the handler independent of render timing; both are only
   * ever written from event handlers, never during render.
   */
  const draftRef = useRef<string | null>(null);
  const selRef = useRef(sel);
  const setDraft = useCallback((v: string | null) => {
    draftRef.current = v;
    setDraftState(v);
  }, []);
  const setSel = useCallback((next: Selection) => {
    selRef.current = next;
    setSelState(next);
  }, []);

  /**
   * Cell the arrow keys are pointing at while picking a reference. Mirrored the
   * same way: the key handler reads the ref, the sheet renders the marker from
   * the state so the user can see where the reference is coming from.
   */
  const pickRef = useRef<Cursor | null>(null);
  const [pick, setPickState] = useState<Cursor | null>(null);
  const setPick = useCallback((v: Cursor | null) => {
    pickRef.current = v;
    setPickState(v);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** True while the mouse is down on the sheet, for drag-select. */
  const dragging = useRef(false);
  /**
   * Box the fill handle is currently being dragged over. Mirrored into a ref
   * for the same reason the draft is: mouseup lands a frame after the last
   * mouseover, and React has not necessarily committed that state yet — reading
   * the state there filled the source onto itself and did nothing.
   */
  const [fillBox, setFillBoxState] = useState<Box | null>(null);
  const fillBoxRef = useRef<Box | null>(null);
  const setFillBox = useCallback((v: Box | null) => {
    fillBoxRef.current = v;
    setFillBoxState(v);
  }, []);
  const fillSrc = useRef<Box | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dataStorage.getText(keySheet),
      dataStorage.getText(keyWidths),
      dataStorage.getText(keyHeights),
      dataStorage.getText(keyColDelta),
      dataStorage.getText(keyHeaderRow),
      dataStorage.getText(keyFilters)
    ]).then(([sheetText, widthsText, heightsText, colDeltaText, headerText, filtersText]) => {
      if (cancelled) {
        return;
      }
      let loaded: Row[] = [];
      try {
        const parsed = sheetText ? JSON.parse(sheetText) : null;
        // Guard against a hand-edited or truncated file: anything that isn't a
        // grid of strings starts the sheet empty rather than crashing the tile.
        if (Array.isArray(parsed)) {
          loaded = parsed.filter(Array.isArray).map((r: unknown[]) => r.map(c => (typeof c === 'string' ? c : String(c ?? ''))));
        }
      } catch {
        loaded = [];
      }
      while (loaded.length < startRows) {
        loaded.push([]);
      }
      setRows(loaded);
      setWidths(readSizes(widthsText, MIN_COL_WIDTH));
      setHeights(readSizes(heightsText, MIN_ROW_HEIGHT));
      setColDelta(Number.isFinite(Number(colDeltaText)) ? Number(colDeltaText) : 0);
      setHeaderRow(headerText === 'true' ? true : headerText === 'false' ? false : null);
      try {
        const parsed = filtersText ? JSON.parse(filtersText) : null;
        setFilters(parsed && typeof parsed === 'object' ? parsed as Filters : null);
      } catch {
        setFilters(null);
      }
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [dataStorage, startRows, setRows, setWidths, setHeights, setColDelta, setHeaderRow, setFilters]);

  // Same cadence as the note widget: save shortly after typing stops.
  const saveSheet = useMemo(() => debounce((d: Row[]) => dataStorage.setText(keySheet, JSON.stringify(trimSheet(d))), 800), [dataStorage]);
  const saveWidths = useMemo(() => debounce((d: number[]) => dataStorage.setText(keyWidths, JSON.stringify(d)), 800), [dataStorage]);
  const saveHeights = useMemo(() => debounce((d: number[]) => dataStorage.setText(keyHeights, JSON.stringify(d)), 800), [dataStorage]);
  const saveColDelta = useMemo(() => debounce((d: number) => dataStorage.setText(keyColDelta, String(d)), 800), [dataStorage]);

  useEffect(() => {
    if (isLoaded) {
      saveWidths(widths);
    }
  }, [widths, isLoaded, saveWidths]);

  useEffect(() => {
    if (isLoaded) {
      saveHeights(heights);
    }
  }, [heights, isLoaded, saveHeights]);

  // The setting is the baseline; inserting or deleting columns moves it from there.
  const cols = Math.max(1, Math.min(MAX_COLS, settings.cols + colDelta));
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);

  const grid = useMemo(() => normalize(rows, cols), [rows, cols]);
  // The sheet is evaluated from committed values only, so a half-typed formula
  // doesn't flash errors through every cell that references it.
  const computed = useMemo(() => evaluateGrid(grid), [grid]);
  const format = useMemo(() => makeFormatter({decimals, thousands}), [decimals, thousands]);

  /**
   * What each cell shows, which is what the filter lists and matches on.
   * Only built when a filter is actually on: formatting every cell of a tall
   * sheet is the single most expensive thing here, and nothing else needs it —
   * cells format their own value as they render.
   */
  const display = useMemo(
    () => (filters === null ? NO_DISPLAY : computed.map(row => row.map(v => format(v)))),
    [filters, computed, format]
  );

  // The filtered table: the block around A1, and the first row that can hide.
  const region = useMemo(() => dataRegion(grid, {row: 0, col: 0}, cols), [grid, cols]);
  const headerAt = headerRow ?? looksLikeHeader(grid, region);
  const firstDataRow = region.top + (headerAt ? 1 : 0);
  const hidden = useMemo(
    () => (filters ? hiddenRows(display, computed, region, firstDataRow, filters) : new Set<number>()),
    [filters, display, computed, region, firstDataRow]
  );
  const isVisible = useCallback((r: number) => !hidden.has(r), [hidden]);

  /**
   * Only the rows on screen are put in the DOM. A thousand rows across fifty
   * columns is fifty thousand cells; rendering them all made every keystroke
   * take seconds. Rows above and below the viewport become two spacer rows, so
   * the scrollbar still measures the whole sheet.
   */
  const [view, setView] = useState({top: 0, height: 400});
  const rowsVisible = useMemo(() => grid.map((_, r) => r).filter(r => !hidden.has(r)), [grid, hidden]);
  const layout = useMemo(() => {
    const tops: number[] = [];
    const index = new Map<number, number>();
    let y = 0;
    for (const r of rowsVisible) {
      index.set(r, tops.length);
      tops.push(y);
      y += heights[r] || rowHeight;
    }
    return {tops, index, total: y};
  }, [rowsVisible, heights, rowHeight]);

  const window_ = useMemo(() => {
    const {tops, total} = layout;
    if (tops.length === 0) {
      return {from: 0, to: 0, padTop: 0, padBottom: 0};
    }
    // Binary search for the first row whose bottom is past the scroll offset.
    let lo = 0;
    let hi = tops.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tops[mid + 1] !== undefined && tops[mid + 1] <= view.top) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const from = Math.max(0, lo - OVERSCAN);
    let to = lo;
    while (to < tops.length && tops[to] < view.top + view.height) {
      to++;
    }
    to = Math.min(tops.length, to + OVERSCAN);
    return {from, to, padTop: tops[from], padBottom: total - (tops[to] ?? total)};
  }, [layout, view]);

  // Track the scroll offset and viewport height that the window is cut from.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return undefined;
    }
    const read = () => setView(prev => (
      prev.top === el.scrollTop && prev.height === el.clientHeight
        ? prev
        : {top: el.scrollTop, height: el.clientHeight}
    ));
    read();
    el.addEventListener('scroll', read, {passive: true});
    const obs = new ResizeObserver(read);
    obs.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      obs.disconnect();
    };
  }, [isLoaded]);

  const box = useMemo(() => selectionBox(sel), [sel]);
  const active = sel.focus;
  const maxRow = Math.max(0, grid.length - 1);

  /** The state an undo would restore, read from the mirrors so it is current. */
  const snapshot = useCallback((): Snapshot => ({
    rows: rowsRef.current,
    widths: widthsRef.current,
    heights: heightsRef.current,
    colDelta: colDeltaRef.current,
    filters: filtersRef.current,
    sel: selRef.current
  }), []);

  /** Records the state before an edit, and drops the redo branch. */
  const remember = useCallback(() => {
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), snapshot()];
    future.current = [];
  }, [snapshot]);

  const commitRows = useCallback((next: Row[]) => {
    remember();
    setRows(next);
    saveSheet(next);
  }, [saveSheet, setRows, remember]);

  /** Puts a whole snapshot back, used by both undo and redo. */
  const restore = useCallback((snap: Snapshot) => {
    setRows(snap.rows);
    setWidths(snap.widths);
    setHeights(snap.heights);
    setColDelta(snap.colDelta);
    setFilters(snap.filters);
    setOpenFilter(null);
    setSel(snap.sel);
    saveSheet(snap.rows);
    saveWidths(snap.widths);
    saveHeights(snap.heights);
    saveColDelta(snap.colDelta);
    dataStorage.setText(keyFilters, snap.filters === null ? '' : JSON.stringify(snap.filters));
  }, [setRows, setWidths, setHeights, setColDelta, setFilters, setSel, saveSheet, saveWidths, saveHeights, saveColDelta, dataStorage]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev) {
      future.current = [...future.current, snapshot()];
      restore(prev);
    }
  }, [snapshot, restore]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      past.current = [...past.current, snapshot()];
      restore(next);
    }
  }, [snapshot, restore]);

  /**
   * Inserts or removes a row/column at the selection, fixing every formula.
   * `after` inserts on the far side of the current cell — "insert below/right".
   */
  const lineOp = useCallback((op: 'insertRow' | 'deleteRow' | 'insertCol' | 'deleteCol', after = false) => {
    const isCol = op === 'insertCol' || op === 'deleteCol';
    const here = isCol ? selRef.current.focus.col : selRef.current.focus.row;
    const at = after ? here + 1 : here;
    if (isCol) {
      const delta = colDeltaRef.current + (op === 'insertCol' ? 1 : -1);
      const width = settings.cols + delta;
      if (width < 1 || width > MAX_COLS) {
        return; // At the edge of what the sheet can show; nothing to do.
      }
      remember();
      // Filters are keyed by column, so they have to move with the columns.
      const current = filtersRef.current;
      if (current) {
        const moved: Filters = {};
        for (const key of Object.keys(current)) {
          const c = Number(key);
          if (c < at) {
            moved[c] = current[c];
          } else if (op === 'deleteCol' && c === at) {
             // That column is gone, and so is its filter.
          } else {
            moved[c + (op === 'insertCol' ? 1 : -1)] = current[c];
          }
        }
        setFilters(moved);
        dataStorage.setText(keyFilters, JSON.stringify(moved));
      }
      setColDelta(delta);
      saveColDelta(delta);
      const next = applyLineOp(rowsRef.current, op, at, width);
      setRows(next);
      saveSheet(next);
      return;
    }
    remember();
    const next = applyLineOp(rowsRef.current, op, at, settings.cols + colDeltaRef.current);
    setRows(next);
    saveSheet(next);
  }, [settings.cols, remember, setColDelta, saveColDelta, setRows, saveSheet, setFilters, dataStorage]);

  /** Writes one cell, growing the sheet if the target row doesn't exist yet. */
  const writeCell = useCallback((at: Cursor, text: string) => {
    const next = grid.map(r => [...r]);
    while (next.length <= at.row) {
      next.push(Array.from({length: cols}, () => ''));
    }
    next[at.row][at.col] = text;
    commitRows(next);
  }, [grid, cols, commitRows]);

  const moveTo = useCallback((row: number, col: number, extend = false) => {
    let r = Math.max(0, Math.min(maxRow, row));
    // Filtered-out rows are skipped over, so the cursor never lands somewhere
    // the user cannot see. Direction is taken from where the move came from.
    if (hidden.has(r)) {
      const dir = row >= selRef.current.focus.row ? 1 : -1;
      while (r >= 0 && r <= maxRow && hidden.has(r)) {
        r += dir;
      }
      if (r < 0 || r > maxRow) {
        return; // Nothing visible that way; stay put.
      }
    }
    const target = {row: r, col: Math.max(0, Math.min(cols - 1, col))};
    setSel({anchor: extend ? selRef.current.anchor : target, focus: target});
  }, [maxRow, cols, hidden, setSel]);

  /**
   * Closes the editor, writing the draft first unless the edit was cancelled.
   *
   * Closing unmounts the editor's input, and focus would fall to <body> — every
   * following keystroke would then miss the sheet entirely. Focus is handed
   * back whenever the editor is what currently holds it, which covers Escape
   * just as much as Enter, and leaves the formula bar alone when the commit
   * came from there.
   */
  const closeEditor = useCallback((commit: boolean) => {
    if (commit && draftRef.current !== null) {
      writeCell(selRef.current.focus, draftRef.current);
    }
    const fromEditor = inputRef.current !== null && document.activeElement === inputRef.current;
    setDraft(null);
    setPick(null);
    if (fromEditor) {
      scrollRef.current?.focus();
    }
  }, [writeCell, setDraft, setPick]);

  const commitDraft = useCallback(() => closeEditor(true), [closeEditor]);

  // Keep the editor focused, and its caret at the end after a reference is
  // written into it by an arrow key.
  useLayoutEffect(() => {
    if (draft !== null && inputRef.current) {
      inputRef.current.focus();
      if (pickRef.current) {
        const n = inputRef.current.value.length;
        inputRef.current.setSelectionRange(n, n);
      }
    }
  }, [draft]);

  /** Applies a fill from `src` into `dst` and leaves the whole box selected. */
  const applyFill = useCallback((src: Box, dst: Box) => {
    commitRows(fillFrom(grid, src, dst, cols));
    setSel({anchor: {row: dst.top, col: dst.left}, focus: {row: dst.bottom, col: dst.right}});
  }, [grid, cols, commitRows, setSel]);

  /**
   * Keeps the active cell on screen.
   *
   * Not a nicety once rows are windowed: a cell outside the rendered slice has
   * no DOM node at all, so moving past the viewport would leave the user with
   * nothing to look at and no editor to type into. The sticky header row and
   * gutter column cover the top and left edges, so they count as insets.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const vi = layout.index.get(active.row);
    if (!el || vi === undefined) {
      return;
    }
    const top = rowHeight + layout.tops[vi];
    const h = heights[active.row] || rowHeight;
    if (top - rowHeight < el.scrollTop) {
      el.scrollTop = Math.max(0, top - rowHeight);
    } else if (top + h > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + h - el.clientHeight;
    }

    let x = GUTTER_WIDTH;
    for (let c = 0; c < active.col; c++) {
      x += widths[c] || DEFAULT_COL_WIDTH;
    }
    const w = widths[active.col] || DEFAULT_COL_WIDTH;
    if (x - GUTTER_WIDTH < el.scrollLeft) {
      el.scrollLeft = Math.max(0, x - GUTTER_WIDTH);
    } else if (x + w > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = x + w - el.clientWidth;
    }
  }, [active, layout, heights, widths, rowHeight]);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) {
      return; // Let an IME finish; its committed text arrives via the input.
    }
    const current = draftRef.current;
    const editing = current !== null;
    const here = selRef.current.focus;
    const delta = ARROW_DELTA[e.key];

    if (delta) {
      // Ctrl+Arrow runs to the edge of the data block instead of one cell.
      if (!editing && (e.ctrlKey || e.metaKey)) {
        const to = blockJump(grid, here, delta[1], delta[0], cols);
        moveTo(to.row, to.col, e.shiftKey);
        e.preventDefault();
        return;
      }
      // While a formula is open and ends where a reference can go, arrows walk
      // a cursor over the sheet and write its name in, Excel-style.
      if (editing && (pickRef.current !== null || acceptsRef(current))) {
        const from = pickRef.current ?? here;
        const next: Cursor = {
          row: Math.max(0, Math.min(maxRow, from.row + delta[1])),
          col: Math.max(0, Math.min(cols - 1, from.col + delta[0]))
        };
        const base = pickRef.current !== null ? dropTrailingRef(current) : current;
        setDraft(base + refName(next));
        setPick(next);
        e.preventDefault();
        return;
      }
      if (editing) {
        // Left/right move the caret inside the text; up/down commit and move.
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          return;
        }
        commitDraft();
      }
      moveTo(here.row + delta[1], here.col + delta[0], e.shiftKey);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'Enter':
        commitDraft();
        if (editing) {
          moveTo(here.row + 1, here.col);
        } else {
          setDraft(grid[here.row]?.[here.col] ?? '');
        }
        e.preventDefault();
        break;
      case 'F2':
        if (!editing) {
          setDraft(grid[here.row]?.[here.col] ?? '');
        }
        e.preventDefault();
        break;
      case 'Tab':
        // Tab takes the first suggestion when one is showing.
        if (editing && !e.shiftKey && completions(current).length > 0) {
          setDraft(applyCompletion(current, completions(current)[0]));
          e.preventDefault();
          return;
        }
        commitDraft();
        moveTo(here.row, here.col + (e.shiftKey ? -1 : 1));
        e.preventDefault();
        break;
      case 'a':
        if (!editing && (e.ctrlKey || e.metaKey)) {
          setSel({anchor: {row: 0, col: 0}, focus: {row: maxRow, col: cols - 1}});
          e.preventDefault();
          return;
        }
        if (!editing && !e.altKey) {
          setDraft(e.key);
          e.preventDefault();
        }
        break;
      case 'Home':
        if (!editing) {
          // Ctrl+Home is the top-left of the sheet; Home is the row's start.
          moveTo(e.ctrlKey || e.metaKey ? 0 : here.row, 0, e.shiftKey);
          e.preventDefault();
        }
        break;
      case 'End':
        if (!editing) {
          // Ctrl+End is the far corner of everything that has been filled in.
          const last = lastUsedCell(grid, cols);
          moveTo(e.ctrlKey || e.metaKey ? last.row : here.row, last.col, e.shiftKey);
          e.preventDefault();
        }
        break;
      case 'PageUp':
      case 'PageDown':
        if (!editing) {
          // A page is however many rows the viewport currently shows.
          const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 0) / rowHeight) - 1);
          moveTo(here.row + (e.key === 'PageDown' ? page : -page), here.col, e.shiftKey);
          e.preventDefault();
        }
        break;
      case 'Escape':
        // Cancel: drop the draft but keep the keyboard on the sheet.
        closeEditor(false);
        e.preventDefault();
        break;
      case 'Delete':
      case 'Backspace':
        if (!editing) {
          commitRows(clearBox(grid, box, isVisible));
          e.preventDefault();
        }
        break;
      case 'z':
        if (!editing && (e.ctrlKey || e.metaKey)) {
          (e.shiftKey ? redo : undo)();
          e.preventDefault();
          return;
        }
        if (!editing && !e.altKey) {
          setDraft(e.key);
          e.preventDefault();
        }
        break;
      case 'y':
        if (!editing && (e.ctrlKey || e.metaKey)) {
          redo();
          e.preventDefault();
          return;
        }
        if (!editing && !e.altKey) {
          setDraft(e.key);
          e.preventDefault();
        }
        break;
      case 'd':
      case 'r':
        // Fill the selection down from its first row / right from its first column.
        if (!editing && (e.ctrlKey || e.metaKey)) {
          const lone = box.top === box.bottom && box.left === box.right;
          // A single cell takes from the neighbour above/left; a range fills
          // itself from its own first row/column.
          const from = e.key === 'd'
            ? {...box, top: lone ? box.top - 1 : box.top, bottom: lone ? box.top - 1 : box.top}
            : {...box, left: lone ? box.left - 1 : box.left, right: lone ? box.left - 1 : box.left};
          if (from.top >= 0 && from.left >= 0) {
            applyFill(from, lone ? {...box, top: from.top, left: from.left} : box);
          }
          e.preventDefault();
          return;
        }
        // Otherwise it is just a letter; fall through to the printable handling.
        if (!editing && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setDraft(e.key);
          e.preventDefault();
        }
        break;
      default:
        // A printable key opens the cell and becomes its first character.
        if (!editing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          setDraft(e.key);
          e.preventDefault();
        }
    }
  }, [maxRow, cols, grid, box, rowHeight, isVisible, moveTo, commitDraft, closeEditor, commitRows, setDraft, setSel, setPick, applyFill, undo, redo]);

  const onCopy = useCallback((e: ReactClipboardEvent) => {
    if (draft !== null) {
      return; // Editing: let the browser copy the selected text.
    }
    // Raw text, so a formula survives the round trip and lands in Excel as a
    // formula rather than as its result.
    e.clipboardData.setData('text/plain', toTsv(grid, box, isVisible));
    e.clipboardData.setData(CLIP_ORIGIN, `${box.top},${box.left}`);
    e.preventDefault();
  }, [draft, grid, box, isVisible]);

  const onCut = useCallback((e: ReactClipboardEvent) => {
    if (draft !== null) {
      return;
    }
    e.clipboardData.setData('text/plain', toTsv(grid, box, isVisible));
    e.clipboardData.setData(CLIP_ORIGIN, `${box.top},${box.left}`);
    commitRows(clearBox(grid, box, isVisible));
    e.preventDefault();
  }, [draft, grid, box, commitRows, isVisible]);

  const onPaste = useCallback((e: ReactClipboardEvent) => {
    if (draft !== null) {
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    let patch = fromTsv(text);
    // A copy from this sheet carries where it came from, so relative references
    // can follow the move. Anything pasted from outside is taken literally.
    const origin = e.clipboardData.getData(CLIP_ORIGIN);
    const [srcRow, srcCol] = origin.split(',').map(Number);
    if (origin && Number.isFinite(srcRow) && Number.isFinite(srcCol)) {
      const dRow = active.row - srcRow;
      const dCol = active.col - srcCol;
      patch = patch.map(line => line.map(v => translateRefs(v, dRow, dCol)));
    }
    commitRows(applyPatch(grid, active, patch, cols, isVisible));
    setSel({
      anchor: active,
      focus: {row: active.row + patch.length - 1, col: Math.min(cols - 1, active.col + patch[0].length - 1)}
    });
    e.preventDefault();
  }, [draft, grid, active, cols, commitRows, setSel, isVisible]);

  const onCellMouseDown = useCallback((e: ReactMouseEvent, row: number, col: number) => {
    if (e.button !== 0) {
      return;
    }
    commitDraft();
    dragging.current = true;
    setSel(e.shiftKey ? {anchor: selRef.current.anchor, focus: {row, col}} : {anchor: {row, col}, focus: {row, col}});
    scrollRef.current?.focus();
    e.preventDefault();
  }, [commitDraft, setSel]);

  const onCellMouseEnter = useCallback((row: number, col: number) => {
    if (fillSrc.current) {
      setFillBox(fillTarget(fillSrc.current, {row, col}));
    } else if (dragging.current) {
      setSel({anchor: selRef.current.anchor, focus: {row, col}});
    }
  }, [setSel, setFillBox]);

  /**
   * Column and row grips. The size lives in `<colgroup>`/`<tr>`, so the browser
   * lays it out directly — nothing has to be told that the sizes changed.
   */
  const startResize = useCallback((e: ReactMouseEvent, axis: 'x' | 'y', index: number) => {
    // Deliberately no preventDefault(): Chrome suppresses the following
    // `dblclick` when mousedown's default is cancelled, which killed the
    // double-click-to-autofit on the very same grip. Text selection is already
    // off for the sheet, so there is nothing left to prevent.
    e.stopPropagation();
    const horizontal = axis === 'x';
    const start = horizontal ? e.clientX : e.clientY;
    const cell = (e.currentTarget as HTMLElement).closest(horizontal ? 'th' : 'tr') as HTMLElement | null;
    const rect = cell?.getBoundingClientRect();
    const startSize = (horizontal ? rect?.width : rect?.height) || (horizontal ? DEFAULT_COL_WIDTH : rowHeight);
    const min = horizontal ? MIN_COL_WIDTH : MIN_ROW_HEIGHT;
    const setSizes = horizontal ? setWidths : setHeights;
    remember();
    const move = (ev: MouseEvent) => setSizes(prev => {
      const next = [...prev];
      next[index] = Math.max(min, Math.round(startSize + (horizontal ? ev.clientX : ev.clientY) - start));
      return next;
    });
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [rowHeight, remember, setWidths, setHeights]);

  const onFillHandleDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fillSrc.current = selectionBox(selRef.current);
    setFillBox(fillSrc.current);
  }, [setFillBox]);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
      const src = fillSrc.current;
      const dst = fillBoxRef.current;
      if (src && dst) {
        applyFill(src, dst);
      }
      fillSrc.current = null;
      setFillBox(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [applyFill, setFillBox]);

  /** Sorts the block around the selection by the selected column. */
  const sort = useCallback((dir: 'asc' | 'desc') => {
    const at = selRef.current.focus;
    const width = settings.cols + colDeltaRef.current;
    const sheet = normalize(rowsRef.current, width);
    const region = dataRegion(sheet, at, width);
    const header = headerRowRef.current ?? looksLikeHeader(sheet, region);
    const next = sortRegion(sheet, region, at.col, dir, header, evaluateGrid(sheet), isVisible);
    if (next !== sheet) {
      commitRows(next);
    }
  }, [settings.cols, commitRows, isVisible]);

  const toggleHeaderRow = useCallback(() => {
    const width = settings.cols + colDeltaRef.current;
    const sheet = normalize(rowsRef.current, width);
    const guessed = looksLikeHeader(sheet, dataRegion(sheet, selRef.current.focus, width));
    const next = !(headerRowRef.current ?? guessed);
    setHeaderRow(next);
    dataStorage.setText(keyHeaderRow, String(next));
  }, [settings.cols, setHeaderRow, dataStorage]);

  const saveFilters = useCallback((next: Filters | null) => {
    remember();
    setFilters(next);
    setOpenFilter(null);
    dataStorage.setText(keyFilters, next === null ? '' : JSON.stringify(next));
  }, [remember, setFilters, dataStorage]);

  /** Turns the column filters on or off, dropping any criteria when off. */
  const toggleFilter = useCallback(() => saveFilters(filtersRef.current ? null : {}), [saveFilters]);

  // The app owns the context menu; the widget just supplies the items. Cut/copy
  // /paste use native roles, which fire the same clipboard events the keyboard
  // shortcuts do, so there is only one implementation of each.
  useEffect(() => {
    widgetApi.setContextMenuFactory(contextId => {
      if (contextId !== CELL_CONTEXT) {
        return [];
      }
      const items: WidgetMenuItem[] = [
        {label: 'Undo', doAction: async () => undo()},
        {label: 'Redo', doAction: async () => redo()},
        {type: 'separator'},
        {label: 'Cut', role: 'cut'},
        {label: 'Copy', role: 'copy'},
        {label: 'Paste', role: 'paste'},
        {
          label: 'Clear',
          doAction: async () => commitRows(clearBox(rowsRef.current, selectionBox(selRef.current), isVisible))
        },
        {type: 'separator'},
        {
          label: 'Filter',
          type: 'checkbox',
          checked: filters !== null,
          doAction: async () => toggleFilter()
        },
        {label: 'Sort A → Z', doAction: async () => sort('asc')},
        {label: 'Sort Z → A', doAction: async () => sort('desc')},
        {
          label: 'Data Has Header Row',
          type: 'checkbox',
          checked: headerRow ?? looksLikeHeader(grid, dataRegion(grid, selRef.current.focus, cols)),
          doAction: async () => toggleHeaderRow()
        },
        {type: 'separator'},
        {label: 'Insert Row Above', doAction: async () => lineOp('insertRow')},
        {label: 'Insert Row Below', doAction: async () => lineOp('insertRow', true)},
        {label: 'Delete Row', doAction: async () => lineOp('deleteRow')},
        {type: 'separator'},
        {label: 'Insert Column Left', doAction: async () => lineOp('insertCol')},
        {label: 'Insert Column Right', doAction: async () => lineOp('insertCol', true)},
        {label: 'Delete Column', doAction: async () => lineOp('deleteCol')}
      ];
      return items;
    });
  }, [widgetApi, undo, redo, commitRows, lineOp, sort, toggleHeaderRow, toggleFilter, filters, headerRow, grid, cols, isVisible]);

  /** Clicking a column or row header selects the whole line; dragging extends. */
  const onHeadMouseDown = useCallback((e: ReactMouseEvent, axis: 'col' | 'row', index: number) => {
    if (e.button !== 0) {
      return;
    }
    commitDraft();
    dragging.current = true;
    const whole = axis === 'col'
      ? {anchor: {row: 0, col: index}, focus: {row: maxRow, col: index}}
      : {anchor: {row: index, col: 0}, focus: {row: index, col: cols - 1}};
    setSel(e.shiftKey ? {anchor: selRef.current.anchor, focus: whole.focus} : whole);
    scrollRef.current?.focus();
    e.preventDefault();
  }, [commitDraft, maxRow, cols, setSel]);

  /**
   * Double-clicking a column's edge sizes it to its widest cell, as Excel does.
   * Text is measured on a canvas with the sheet's own font rather than by
   * rendering and reading back, which would cost a layout pass per column.
   */
  const autoFit = useCallback((col: number) => {
    const probe = document.createElement('canvas').getContext('2d');
    const sample = scrollRef.current?.querySelector('td');
    if (!probe || !sample) {
      return;
    }
    const cs = getComputedStyle(sample);
    probe.font = `${cs.fontSize} ${cs.fontFamily}`;
    const widest = grid.reduce((w, row, r) => {
      const text = format(computed[r]?.[col] ?? row[col] ?? '');
      return Math.max(w, probe.measureText(text).width);
    }, probe.measureText(colName(col)).width);
    remember();
    setWidths(prev => {
      const next = [...prev];
      // A little padding so the text isn't flush against the cell border.
      next[col] = Math.max(MIN_COL_WIDTH, Math.ceil(widest) + 12);
      return next;
    });
  }, [grid, computed, format, remember, setWidths]);

  const addRows = useCallback(() => {
    commitRows([...grid, ...Array.from({length: ADD_ROWS}, () => Array.from({length: cols}, () => ''))]);
  }, [grid, cols, commitRows]);

  // Derived, not stored: whatever the draft currently is decides the list, so
  // there is no second copy of the state to keep in step.
  const hints = draft === null ? [] : completions(draft).slice(0, 6);
  /**
   * The table's width is stated rather than left to the browser. With
   * `table-layout: fixed` and an auto width, Chrome still raises the table to
   * the first row's min-content — one long label was widening its column past
   * the width the <colgroup> asked for.
   */
  const colWidth = (c: number) => widths[c] || DEFAULT_COL_WIDTH;
  const tableWidth = GUTTER_WIDTH + Array.from({length: cols}, (_, c) => colWidth(c)).reduce((a, b) => a + b, 0);

  // Only worth the strip of space once more than one cell is selected, which
  // is also the only time the numbers tell you anything.
  const multi = box.top !== box.bottom || box.left !== box.right;
  const stats = useMemo(
    () => (multi ? selectionStats(computed, box, isVisible) : null),
    [multi, computed, box, isVisible]
  );

  /** Opens a column's filter dropdown, or closes it when passed -1 / the same column. */
  const onOpenFilter = useCallback((c: number) => setOpenFilter(prev => (c < 0 || prev === c ? null : c)), []);

  const onApplyFilter = useCallback((c: number, next: Filter | undefined) => {
    const rest = {...(filtersRef.current ?? {})};
    if (next === undefined) {
      delete rest[c];
    } else {
      rest[c] = next;
    }
    saveFilters(rest);
  }, [saveFilters]);

  const activeRaw = grid[active.row]?.[active.col] ?? '';

  if (!isLoaded) {
    return <div className={styles['spreadsheet-widget']}/>;
  }

  return (
    <div className={styles['spreadsheet-widget']}>
      {formulaBar && (
        <div className={styles['formula-bar']}>
          <span className={styles['formula-ref']}>{refName(active)}</span>
          <input
            className={styles['formula-input']}
            value={draft !== null ? draft : activeRaw}
            // selRef, not the rendered `active`: clicking a cell and typing here
            // immediately would otherwise write into the previously selected cell.
            onChange={e => (draft !== null ? setDraft(e.target.value) : writeCell(selRef.current.focus, e.target.value))}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                commitDraft();
                e.currentTarget.blur();
                scrollRef.current?.focus();
              }
              // The sheet's key handler sits on an ancestor; keystrokes meant
              // for this field must not also drive the selection.
              e.stopPropagation();
            }}
          />
        </div>
      )}

      <div
        className={styles['scroll']}
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
      >
        <table className={styles['sheet']} style={{width: tableWidth}}>
          <colgroup>
            <col style={{width: GUTTER_WIDTH}}/>
            {Array.from({length: cols}, (_, c) => <col key={c} style={{width: colWidth(c)}}/>)}
          </colgroup>
          <thead>
          <tr style={{height: rowHeight}}>
            <th className={styles['corner']}/>
            {Array.from({length: cols}, (_, c) => (
              <th
                key={c}
                className={`${styles['col-head']} ${c >= box.left && c <= box.right ? styles['head-on'] : ''}`}
                onMouseDown={e => onHeadMouseDown(e, 'col', c)}
                onMouseEnter={() => dragging.current && setSel({
                  anchor: selRef.current.anchor,
                  focus: {row: maxRow, col: c}
                })}
              >
                {colName(c)}
                <span
                  className={styles['grip-col']}
                  onMouseDown={e => startResize(e, 'x', c)}
                  onDoubleClick={() => autoFit(c)}
                />
              </th>
            ))}
          </tr>
          </thead>
          <tbody>
          {window_.padTop > 0 && <tr style={{height: window_.padTop}} aria-hidden/>}
          {rowsVisible.slice(window_.from, window_.to).map(r => (
            <SheetRow
              key={r}
              r={r}
              row={grid[r]}
              values={computed[r]}
              format={format}
              cols={cols}
              height={heights[r] || rowHeight}
              headOn={r >= box.top && r <= box.bottom}
              selLeft={r >= box.top && r <= box.bottom ? box.left : -1}
              selRight={r >= box.top && r <= box.bottom ? box.right : -1}
              fillLeft={fillBox && r >= fillBox.top && r <= fillBox.bottom && !(r >= box.top && r <= box.bottom) ? fillBox.left : -1}
              fillRight={fillBox && r >= fillBox.top && r <= fillBox.bottom && !(r >= box.top && r <= box.bottom) ? fillBox.right : -1}
              activeCol={r === active.row ? active.col : -1}
              pickCol={pick !== null && pick.row === r ? pick.col : -1}
              handleCol={draft === null && r === box.bottom ? box.right : -1}
              draft={r === active.row ? draft : null}
              hints={r === active.row ? hints : NO_HINTS}
              inputRef={inputRef}
              filterLeft={filters !== null && r === region.top ? region.left : -1}
              filterRight={filters !== null && r === region.top ? region.right : -1}
              filters={filters}
              openFilterCol={r === region.top ? openFilter ?? -1 : -1}
              menuValues={r === region.top && openFilter !== null && filters !== null
                ? uniqueValues(display, region, firstDataRow, openFilter)
                : null}
              menuNumeric={openFilter !== null && isNumeric(computed[firstDataRow]?.[openFilter] ?? '')}
              onCellMouseDown={onCellMouseDown}
              onCellMouseEnter={onCellMouseEnter}
              onHeadMouseDown={onHeadMouseDown}
              onResize={startResize}
              onFillHandleDown={onFillHandleDown}
              onOpenFilter={onOpenFilter}
              onApplyFilter={onApplyFilter}
              setDraft={setDraft}
              setPick={setPick}
            />
          ))}
          {window_.padBottom > 0 && <tr style={{height: window_.padBottom}} aria-hidden/>}
          </tbody>
        </table>

        <button type='button' className={styles['add-rows']} onClick={addRows}>+ {ADD_ROWS} rows</button>
      </div>

      {stats && (
        <div className={styles['status-bar']}>
          <span>Count {stats.count}</span>
          {stats.numeric > 0 && <span>Sum {format(stats.sum)}</span>}
          {stats.numeric > 0 && <span>Average {format(stats.sum / stats.numeric)}</span>}
          {stats.numeric > 0 && <span>Min {format(stats.min)}</span>}
          {stats.numeric > 0 && <span>Max {format(stats.max)}</span>}
        </div>
      )}
    </div>
  )
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SpreadsheetWidget
}
