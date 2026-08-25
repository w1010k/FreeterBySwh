/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  CreateSettingsState,
  ReactComponent,
  SettingBlock,
  SettingsEditorReactComponentProps
} from '@/widgets/appModules';

/**
 * Widest sheet we'll render. Every column is in the DOM, so this is a rendering
 * cap rather than a data one — the formula engine addresses far more.
 */
export const MAX_COLS = 256;
/** A..Z. Wider sheets are a setting away; this is what a blank one shows. */
const DEFAULT_COLS = 26;
/** Rows a new sheet starts with. The Add button and typing grow it from there. */
const DEFAULT_ROWS = 100;
const MAX_ROWS = 100000;
/** `decimals` sentinel: show a number exactly as it comes out of the engine. */
export const DECIMALS_AUTO = -1;
const MAX_DECIMALS = 6;
/** Row height bounds. The low end is about as tight as 12px text can sit. */
const MIN_ROW_HEIGHT = 18;
const MAX_ROW_HEIGHT = 60;
const DEFAULT_ROW_HEIGHT = 24;

export interface Settings {
  /** Which defaults this sheet was created against; see SETTINGS_VERSION. */
  v: number;
  cols: number;
  /** Rows the sheet starts with; the Add button grows it from there. */
  rows: number;
  /** Fixed decimal places for numeric results, or DECIMALS_AUTO. */
  decimals: number;
  /** Group thousands with a separator (1234567 -> 1,234,567). */
  thousands: boolean;
  /** Show the formula bar above the grid. */
  formulaBar: boolean;
  /** Height of every row; dragging a row number overrides it for that row. */
  rowHeight: number;
}

/** Keeps a hand-edited or legacy settings value inside the renderable range. */
export function clampCols(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_COLS, Math.max(1, n)) : DEFAULT_COLS;
}

/** Keeps the starting row count inside what the sheet can address. */
export function clampRows(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_ROWS, Math.max(1, n)) : DEFAULT_ROWS;
}

/** Keeps the row height inside the range that still renders readable text. */
export function clampRowHeight(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, n)) : DEFAULT_ROW_HEIGHT;
}

/** Same for decimals, where DECIMALS_AUTO is the valid low end. */
export function clampDecimals(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.min(MAX_DECIMALS, Math.max(DECIMALS_AUTO, n)) : DECIMALS_AUTO;
}

/**
 * Stamped into every sheet's settings. Bump it when a default changes in a way
 * that existing sheets should pick up; anything without the current stamp takes
 * the new defaults once, then carries the stamp and is left alone after that.
 *
 * 1: the sheet grew from 6 columns to A..AZ.
 * 2: settled on A..Z and 100 rows — wide enough to work in, small enough to
 *    scan, and both are a setting away.
 */
const SETTINGS_VERSION = 2;

export const createSettingsState: CreateSettingsState<Settings> = (settings) => {
  const stale = settings.v !== SETTINGS_VERSION;
  return {
    v: SETTINGS_VERSION,
    // A sheet saved against older defaults takes the current ones once. There is
    // no telling an old default from a size someone picked, hence the stamp.
    cols: stale ? DEFAULT_COLS : clampCols(settings.cols),
    rows: stale ? DEFAULT_ROWS : clampRows(settings.rows),
    decimals: clampDecimals(settings.decimals),
    thousands: typeof settings.thousands === 'boolean' ? settings.thousands : false,
    // Default on: without it there is nowhere to read a long formula in a narrow cell.
    formulaBar: typeof settings.formulaBar === 'boolean' ? settings.formulaBar : true,
    rowHeight: clampRowHeight(settings.rowHeight)
  };
}

export function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  return (
    <>
      <SettingBlock
        titleForId='spreadsheet-cols'
        title='Columns'
        moreInfo={`Number of columns in the sheet (1-${MAX_COLS}). Columns are named A, B ... Z, AA, AB ... and can be referenced in formulas. Drag the right edge of a column header to resize it. Very wide sheets render more slowly.`}
      >
        <input
          type='number'
          id='spreadsheet-cols'
          min={1}
          max={MAX_COLS}
          value={settings.cols}
          onChange={e => updateSettings({...settings, cols: clampCols(Number(e.target.value))})}
        />
      </SettingBlock>

      <SettingBlock
        titleForId='spreadsheet-rows'
        title='Rows'
        moreInfo={`How many rows a new sheet starts with (1-${MAX_ROWS}). Only the rows on screen are rendered, so a tall sheet costs nothing until you scroll to it.`}
      >
        <input
          type='number'
          id='spreadsheet-rows'
          min={1}
          max={MAX_ROWS}
          value={settings.rows}
          onChange={e => updateSettings({...settings, rows: clampRows(Number(e.target.value))})}
        />
      </SettingBlock>

      <SettingBlock
        titleForId='spreadsheet-row-height'
        title='Row Height'
        moreInfo={`Height of every row in pixels (${MIN_ROW_HEIGHT}-${MAX_ROW_HEIGHT}). Drag the bottom edge of a row number to give that one row its own height.`}
      >
        <input
          type='number'
          id='spreadsheet-row-height'
          min={MIN_ROW_HEIGHT}
          max={MAX_ROW_HEIGHT}
          value={settings.rowHeight}
          onChange={e => updateSettings({...settings, rowHeight: clampRowHeight(Number(e.target.value))})}
        />
      </SettingBlock>

      <SettingBlock
        titleForId='spreadsheet-decimals'
        title='Decimal Places'
        moreInfo='How many decimals to show for numeric results. "Auto" prints the number as calculated. Only the display changes — the stored value and any formula referencing it keep full precision.'
      >
        <select
          id='spreadsheet-decimals'
          value={settings.decimals}
          onChange={e => updateSettings({...settings, decimals: clampDecimals(Number(e.target.value))})}
        >
          <option value={DECIMALS_AUTO}>Auto</option>
          {Array.from({length: MAX_DECIMALS + 1}, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </SettingBlock>

      <SettingBlock
        titleForId='spreadsheet-thousands'
        title='Thousands Separator'
        moreInfo='Group large numbers (1234567 shows as 1,234,567). Display only.'
      >
        <div>
          <label>
            <input
              type='checkbox'
              id='spreadsheet-thousands'
              checked={settings.thousands}
              onChange={_ => updateSettings({...settings, thousands: !settings.thousands})}
            />
            Group Thousands
          </label>
        </div>
      </SettingBlock>

      <SettingBlock
        titleForId='spreadsheet-formula-bar'
        title='Formula Bar'
        moreInfo='Shows the selected cell name and its source text above the grid, so long formulas are readable and editable even in a narrow column.'
      >
        <div>
          <label>
            <input
              type='checkbox'
              id='spreadsheet-formula-bar'
              checked={settings.formulaBar}
              onChange={_ => updateSettings({...settings, formulaBar: !settings.formulaBar})}
            />
            Show Formula Bar
          </label>
        </div>
      </SettingBlock>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
