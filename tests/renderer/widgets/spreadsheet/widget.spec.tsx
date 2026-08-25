/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {WidgetContextMenuFactory, WidgetMenuItem} from '@/widgets/appModules';
import {createSettingsState, Settings} from '@/widgets/spreadsheet/settings';
import {widgetComp} from '@/widgets/spreadsheet/widget';
import {act, fireEvent, waitFor} from '@testing-library/react';
import {setupWidgetSut} from '@tests/widgets/setupSut';

/**
 * The sheet is a plain `<table>` with no virtualisation and no measurement, so
 * unlike the previous library-backed grid it renders fully under jsdom and can
 * be driven the way a user drives it.
 */
/**
 * The sheet only renders the rows in view, which needs a ResizeObserver and a
 * viewport height — jsdom has neither. A tall fake viewport keeps every row of
 * these small fixtures on screen, so the tests can address rows by index.
 */
beforeAll(() => {
  global.ResizeObserver = class {
    observe() { /* jsdom never resizes anything */
    }

    unobserve() { /* noop */
    }

    disconnect() { /* noop */
    }
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 2000});
});

/** The last context-menu factory the widget handed to the app. */
let menuFactory: WidgetContextMenuFactory | null = null;

function setup(stored?: unknown, over?: Partial<Settings>, extra?: Record<string, string>) {
  menuFactory = null;
  const settings = {...createSettingsState({v: 2, cols: 3, rows: 20}), ...over} as Settings;
  const store: Record<string, string> = {...extra};
  if (stored !== undefined) {
    store.sheet = JSON.stringify(stored);
  }
  return setupWidgetSut(widgetComp, settings, {
    mockWidgetApi: {
      setContextMenuFactory: jest.fn((f: WidgetContextMenuFactory) => {
        menuFactory = f;
      }),
      dataStorage: {
        getText: jest.fn(async (key: string) => store[key]),
        setText: jest.fn(async (key: string, v: string) => {
          store[key] = v;
        })
      }
    }
  });
}

/** Row texts as rendered, hidden rows absent. */
const shownRows = () => [...document.querySelectorAll('tbody tr')]
  .map(r => [...r.querySelectorAll('td')].map(t => t.textContent).join('|'));

/**
 * Runs a context-menu entry by its label, as right-clicking a cell would.
 * Wrapped in act(): the menu action is invoked outside React's event system, so
 * nothing flushes its state updates for us.
 */
async function menu(label: string) {
  const items = menuFactory!('cell', undefined) as WidgetMenuItem[];
  const item = items.find(i => 'label' in i && i.label === label) as { doAction?: () => Promise<void> };
  expect(item).toBeTruthy();
  await act(async () => {
    await item.doAction!();
  });
}

/** Body cells in row-major order (3 per row). */
async function cells() {
  await waitFor(() => expect(document.querySelectorAll('tbody td').length).toBeGreaterThan(0));
  return Array.from(document.querySelectorAll('tbody td')) as HTMLTableCellElement[];
}

const sheetText = async (i: number) => (await cells())[i].textContent;
const scroller = () => document.querySelector('[tabindex="0"]') as HTMLElement;
const editor = () => document.querySelector('tbody input') as HTMLInputElement | null;
const formulaBar = () => document.querySelectorAll('input')[0] as HTMLInputElement;

/** Selects a cell the way a user does. */
async function click(index: number) {
  fireEvent.mouseDown((await cells())[index], {button: 0});
  fireEvent.mouseUp(window);
}

describe('Spreadsheet Widget', () => {
  it('renders headers and the stored sheet', async () => {
    setup([['2', '3', '=A1*B1']]);
    await cells();
    expect(Array.from(document.querySelectorAll('thead th')).map(h => h.textContent)).toEqual(['', 'A', 'B', 'C']);
    expect(await sheetText(0)).toBe('2');
    expect(await sheetText(2)).toBe('6');
  });

  it('keeps a typed value after moving to another cell', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('5{Enter}');
    expect(await sheetText(0)).toBe('5');
  });

  it('shows the source while editing and the value at rest', async () => {
    const {userEvent} = setup([['2', '3', '=A1*B1']]);
    const user = userEvent.setup();
    await click(2);
    expect(await sheetText(2)).toBe('6');

    await user.keyboard('{Enter}');
    expect(editor()!.value).toBe('=A1*B1');
    await user.keyboard('{Escape}');
    expect(await sheetText(2)).toBe('6');
  });

  it('recalculates dependent cells on commit', async () => {
    const {userEvent} = setup([['2', '3', '=A1*B1']]);
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('4{Enter}');
    expect(await sheetText(2)).toBe('12');
  });

  it('writes a cell reference when an arrow follows an open formula', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(3); // A2
    await user.keyboard('=');
    await user.keyboard('{ArrowUp}');
    expect(editor()!.value).toBe('=A1');

    // A second arrow replaces the reference rather than appending another.
    await user.keyboard('{ArrowRight}');
    expect(editor()!.value).toBe('=B1');

    // An operator ends the pick, so the next arrow starts a fresh reference.
    await user.keyboard('+');
    await user.keyboard('{ArrowUp}');
    expect(editor()!.value).toBe('=B1+A1');
  });

  it('marks the cell a reference points at while picking', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(3); // A2
    await user.keyboard('=');
    // Nothing is marked until an arrow actually picks something.
    expect(document.querySelectorAll('tbody td[class*="picked"]')).toHaveLength(0);

    await user.keyboard('{ArrowUp}');
    const marked = document.querySelectorAll('tbody td[class*="picked"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe((await cells())[0]); // A1

    // The marker follows the reference, and clears when the edit ends.
    await user.keyboard('{ArrowRight}');
    expect(document.querySelectorAll('tbody td[class*="picked"]')[0]).toBe((await cells())[1]);
    await user.keyboard('{Escape}');
    expect(document.querySelectorAll('tbody td[class*="picked"]')).toHaveLength(0);
  });

  it('keeps the keyboard on the sheet after Escape cancels an edit', async () => {
    // Regression: closing the editor unmounted its input and focus fell to
    // <body>, so every key after Escape went nowhere.
    const {userEvent} = setup([['1', '2', '3']]);
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('9{Escape}');
    expect(await sheetText(0)).toBe('1'); // cancelled, not written
    expect(scroller()).toHaveFocus();

    // And the sheet still responds to the very next keystroke.
    await user.keyboard('{ArrowRight}8{Enter}');
    expect(await sheetText(1)).toBe('8');
  });

  it('leaves arrow navigation alone when the cell is not an open formula', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('7{ArrowDown}8{Enter}');
    expect(await sheetText(0)).toBe('7');
    expect(await sheetText(3)).toBe('8');
  });

  it('clears the selected range with Delete', async () => {
    const {userEvent} = setup([['7', '8', '9']]);
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await user.keyboard('{Delete}');
    expect(await sheetText(0)).toBe('');
    expect(await sheetText(1)).toBe('');
    expect(await sheetText(2)).toBe('9');
  });

  it('copies the selected range as TSV of raw text', async () => {
    setup([['1', '2', '=A1+B1']]);
    await click(0);
    fireEvent.keyDown(scroller(), {key: 'ArrowRight', shiftKey: true});
    fireEvent.keyDown(scroller(), {key: 'ArrowRight', shiftKey: true});

    const written: Record<string, string> = {};
    fireEvent.copy(scroller(), {
      clipboardData: {
        setData: (t: string, v: string) => {
          written[t] = v;
        }
      }
    });
    expect(written['text/plain']).toBe('1\t2\t=A1+B1');
    // The origin travels with it so a paste can move relative references.
    expect(written['text/x-freeter-sheet']).toBe('0,0');
  });

  it('pastes TSV from Excel across cells and rows', async () => {
    setup();
    await click(0);
    // No origin type: this is text from another app, pasted verbatim.
    fireEvent.paste(scroller(), {clipboardData: {getData: (t: string) => (t === 'text/plain' ? '10\t20\n30\t40\r\n' : '')}});
    expect(await sheetText(0)).toBe('10');
    expect(await sheetText(1)).toBe('20');
    expect(await sheetText(3)).toBe('30');
    expect(await sheetText(4)).toBe('40');
  });

  it('edits the active cell from the formula bar', async () => {
    setup([['2', '3', '=A1*B1']]);
    await click(0);
    fireEvent.change(formulaBar(), {target: {value: '10'}});
    expect(await sheetText(2)).toBe('30');
  });

  it('resizes a column by dragging its header edge', async () => {
    const {widgetApi} = setup();
    await cells();
    const grip = document.querySelector('thead th span') as HTMLElement;
    // jsdom reports a zero-size header, so the drag starts from the default.
    fireEvent.mouseDown(grip, {clientX: 100});
    fireEvent.mouseMove(document, {clientX: 160});
    fireEvent.mouseUp(document);

    expect(document.querySelectorAll('colgroup col')[1]).toHaveStyle({width: '150px'});
    await waitFor(
      () => expect(widgetApi.dataStorage.setText).toHaveBeenCalledWith('colWidths', expect.stringContaining('150')),
      {timeout: 2000}
    );
  });

  it('resizes one row by dragging its number edge, leaving the others alone', async () => {
    setup();
    await cells();
    const grip = document.querySelector('tbody th span') as HTMLElement;
    fireEvent.mouseDown(grip, {clientY: 100});
    fireEvent.mouseMove(document, {clientY: 130});
    fireEvent.mouseUp(document);

    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0]).toHaveStyle({height: '54px'});
    expect(rows[1]).toHaveStyle({height: '24px'});
  });

  it('adds rows on demand', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await cells();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(20);
    await user.click(document.querySelector('button')!);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(30);
  });

  it('survives corrupt stored data instead of crashing the tile', async () => {
    setup({not: 'a grid'});
    expect((await cells()).length).toBe(20 * 3);
  });

  it('moves relative references when a formula is pasted elsewhere', async () => {
    const {userEvent} = setup([['1', '2', '=A1+B1']]);
    const user = userEvent.setup();
    await click(2); // C1
    const clip: Record<string, string> = {};
    fireEvent.copy(scroller(), {
      clipboardData: {
        setData: (t: string, v: string) => {
          clip[t] = v;
        }
      }
    });

    await click(5); // C2
    fireEvent.paste(scroller(), {clipboardData: {getData: (t: string) => clip[t] ?? ''}});
    // Pasted one row down, so the formula follows: A1+B1 -> A2+B2.
    await user.keyboard('{Enter}');
    expect(editor()!.value).toBe('=A2+B2');
  });

  it('pastes text from outside the sheet verbatim', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(3); // A2
    fireEvent.paste(scroller(), {clipboardData: {getData: (t: string) => (t === 'text/plain' ? '=A1+1' : '')}});
    await user.keyboard('{Enter}');
    expect(editor()!.value).toBe('=A1+1');
  });

  it('fills down from the handle, continuing a series', async () => {
    setup([['1', '', ''], ['3', '', ''], ['', '', ''], ['', '', '']]);
    await click(0);
    fireEvent.keyDown(scroller(), {key: 'ArrowDown', shiftKey: true}); // A1:A2
    const handle = document.querySelector('tbody td span[class*="fill-handle"]') as HTMLElement;
    expect(handle).toBeTruthy();
    fireEvent.mouseDown(handle);
    fireEvent.mouseEnter((await cells())[9]); // A4
    fireEvent.mouseUp(window);
    expect(await sheetText(6)).toBe('5');
    expect(await sheetText(9)).toBe('7');
  });

  it('fills down with Ctrl+D, rewriting formula references', async () => {
    setup([['1', '2', '=A1+B1'], ['3', '4', ''], ['5', '6', '']]);
    await click(2); // C1
    fireEvent.keyDown(scroller(), {key: 'ArrowDown', shiftKey: true});
    fireEvent.keyDown(scroller(), {key: 'ArrowDown', shiftKey: true}); // C1:C3
    fireEvent.keyDown(scroller(), {key: 'd', ctrlKey: true});
    expect(await sheetText(5)).toBe('7'); // =A2+B2
    expect(await sheetText(8)).toBe('11'); // =A3+B3
  });

  it('takes an edit back with Ctrl+Z and puts it back with Ctrl+Y', async () => {
    const {userEvent} = setup([['1', '2', '3']]);
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('99{Enter}');
    expect(await sheetText(0)).toBe('99');

    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(0)).toBe('1');

    fireEvent.keyDown(scroller(), {key: 'y', ctrlKey: true});
    expect(await sheetText(0)).toBe('99');
  });

  it('undoes several edits in order and stops at the beginning', async () => {
    const {userEvent} = setup([['1', '', '']]);
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('2{Enter}');
    await click(0);
    await user.keyboard('3{Enter}');

    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(0)).toBe('2');
    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(0)).toBe('1');
    // Nothing left to undo; the sheet stays put rather than clearing.
    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(0)).toBe('1');
  });

  it('types a plain z or y instead of undoing when Ctrl is not held', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('z{Enter}');
    expect(await sheetText(0)).toBe('z');
  });

  it('inserts a row above and moves later formulas with it', async () => {
    setup([['1', '', ''], ['2', '', '=A1+A2']]);
    await click(3); // A2
    await menu('Insert Row Above');

    expect(await sheetText(0)).toBe('1');
    expect(await sheetText(3)).toBe(''); // the new blank row
    expect(await sheetText(6)).toBe('2');
    expect(await sheetText(8)).toBe('3'); // =A1+A3 still adds the same cells
  });

  it('inserts a row below the selected one', async () => {
    setup([['1', '', ''], ['2', '', '']]);
    await click(0); // A1
    await menu('Insert Row Below');
    expect(await sheetText(0)).toBe('1');
    expect(await sheetText(3)).toBe('');
    expect(await sheetText(6)).toBe('2');
  });

  it('deletes a row and leaves #REF behind for formulas that needed it', async () => {
    setup([['1', '', ''], ['2', '', ''], ['=A2', '', '']]);
    await click(3); // A2
    await menu('Delete Row');
    expect(await sheetText(0)).toBe('1');
    expect(await sheetText(3)).toBe('#REF');
  });

  it('inserts and deletes columns, widening and narrowing the sheet', async () => {
    setup([['a', 'b', 'c']]);
    await click(1); // B1
    await menu('Insert Column Left');
    expect(document.querySelectorAll('thead th')).toHaveLength(5); // gutter + 4
    expect(await sheetText(0)).toBe('a');
    expect(await sheetText(1)).toBe('');
    expect(await sheetText(2)).toBe('b');

    await menu('Delete Column');
    expect(document.querySelectorAll('thead th')).toHaveLength(4);
    expect(await sheetText(1)).toBe('b');
  });

  it('undoes a row insert', async () => {
    setup([['1', '', ''], ['2', '', '']]);
    await click(3);
    await menu('Insert Row Above');
    expect(await sheetText(3)).toBe('');
    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(3)).toBe('2');
  });

  it('clears the selection from the context menu', async () => {
    setup([['1', '2', '3']]);
    await click(0);
    fireEvent.keyDown(scroller(), {key: 'ArrowRight', shiftKey: true});
    await menu('Clear');
    expect(await sheetText(0)).toBe('');
    expect(await sheetText(1)).toBe('');
    expect(await sheetText(2)).toBe('3');
  });

  it('jumps to the edge of a data block with Ctrl+Arrow', async () => {
    setup([['1', '', ''], ['2', '', ''], ['', '', ''], ['9', '', '']]);
    await click(0);
    fireEvent.keyDown(scroller(), {key: 'ArrowDown', ctrlKey: true});
    expect(document.querySelectorAll('tbody td[class*="active"]')[0]).toBe((await cells())[3]); // A2

    // From the end of the block, the next jump skips the gap.
    fireEvent.keyDown(scroller(), {key: 'ArrowDown', ctrlKey: true});
    expect(document.querySelectorAll('tbody td[class*="active"]')[0]).toBe((await cells())[9]); // A4
  });

  it('selects the whole sheet with Ctrl+A', async () => {
    setup();
    await click(0);
    fireEvent.keyDown(scroller(), {key: 'a', ctrlKey: true});
    expect(document.querySelectorAll('tbody td[class*="selected"]')).toHaveLength(20 * 3);
  });

  it('selects a whole column or row from its header', async () => {
    setup();
    await cells();
    fireEvent.mouseDown(document.querySelectorAll('thead th')[2], {button: 0}); // B
    fireEvent.mouseUp(window);
    expect(document.querySelectorAll('tbody td[class*="selected"]')).toHaveLength(20);

    fireEvent.mouseDown(document.querySelectorAll('tbody th')[1], {button: 0}); // row 2
    fireEvent.mouseUp(window);
    expect(document.querySelectorAll('tbody td[class*="selected"]')).toHaveLength(3);
  });

  it('moves to the row start with Home and the used corner with Ctrl+End', async () => {
    setup([['1', '2', '3'], ['', '', 'x']]);
    await click(2);
    fireEvent.keyDown(scroller(), {key: 'Home'});
    expect(document.querySelectorAll('tbody td[class*="active"]')[0]).toBe((await cells())[0]);

    fireEvent.keyDown(scroller(), {key: 'End', ctrlKey: true});
    expect(document.querySelectorAll('tbody td[class*="active"]')[0]).toBe((await cells())[5]); // C2
  });

  it('suggests function names while a formula is being typed', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('=SU');
    const names = [...document.querySelectorAll('tbody li button')].map(b => b.textContent);
    expect(names).toContain('SUM');

    // Tab takes the first suggestion and opens its parenthesis, staying in the cell.
    await user.keyboard('{Tab}');
    expect(editor()!.value).toBe('=SUM(');
  });

  it('offers nothing to complete outside a formula', async () => {
    const {userEvent} = setup();
    const user = userEvent.setup();
    await click(0);
    await user.keyboard('SU');
    expect(document.querySelectorAll('tbody li button')).toHaveLength(0);
  });

  it('lets text spill over an empty neighbour but not over a filled one', async () => {
    setup([['a long label', '', ''], ['a long label', 'x', '']]);
    const td = await cells();
    // A1's neighbour is empty, so it spills; A2's is not, so it stays clipped.
    expect(td[0].className).toContain('spill');
    expect(td[3].className).not.toContain('spill');
  });

  it('does not spill numbers or errors, which must stay in their column', async () => {
    setup([['123456789', '', ''], ['=1/0', '', '']]);
    const td = await cells();
    expect(td[0].className).not.toContain('spill');
    expect(td[3].className).not.toContain('spill');
  });

  it('right-aligns a typed number, not just a computed one', async () => {
    setup([['123', 'abc', '=1+1']]);
    const td = await cells();
    expect(td[0].className).toContain('num');
    expect(td[1].className).not.toContain('num');
    expect(td[2].className).toContain('num');
  });

  it('sorts the block around the selection, holding a detected header in place', async () => {
    setup([['name', 'qty', ''], ['b', '2', ''], ['a', '1', ''], ['c', '3', '']]);
    await click(0);
    await menu('Sort A → Z');
    expect(await sheetText(0)).toBe('name');
    expect([3, 6, 9].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending by the selected column', async () => {
    setup([['name', 'qty', ''], ['b', '2', ''], ['a', '1', ''], ['c', '3', '']]);
    await click(4); // B2, so qty is the key
    await menu('Sort Z → A');
    expect([4, 7, 10].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['3', '2', '1']);
  });

  it('moves formulas with their row when sorting', async () => {
    setup([['3', '=A1*2', ''], ['1', '=A2*2', ''], ['2', '=A3*2', '']]);
    await click(0);
    await menu('Sort A → Z');
    // Values sorted, and each formula still doubles the cell beside it.
    expect([0, 3, 6].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['1', '2', '3']);
    expect([1, 4, 7].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['2', '4', '6']);
  });

  it('lets the header toggle override the guess', async () => {
    setup([['b', '', ''], ['a', '', ''], ['c', '', '']]);
    await click(0);
    // No numeric column, so nothing is guessed as a header: all three sort.
    await menu('Sort A → Z');
    expect([0, 3, 6].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['a', 'b', 'c']);

    await menu('Data Has Header Row');
    await menu('Sort Z → A');
    // Now the first row is pinned and only the rest is reordered.
    expect([0, 3, 6].map(i => (document.querySelectorAll('tbody td')[i] as HTMLElement).textContent)).toEqual(['a', 'c', 'b']);
  });

  it('undoes a sort', async () => {
    setup([['b', '', ''], ['a', '', '']]);
    await click(0);
    await menu('Sort A → Z');
    expect(await sheetText(0)).toBe('a');
    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(await sheetText(0)).toBe('b');
  });

  it('shows filter buttons on the header row once filtering is on', async () => {
    setup([['name', 'qty', ''], ['b', '2', ''], ['a', '1', '']]);
    await click(0);
    expect(document.querySelectorAll('tbody button')).toHaveLength(0);

    await menu('Filter');
    // One per column of the detected table, on its header row only.
    const buttons = [...document.querySelectorAll('tbody button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].closest('tr')).toBe(document.querySelectorAll('tbody tr')[0]);
  });

  it('hides the rows a value filter excludes and brings them back on clear', async () => {
    const {userEvent} = setup([['name', 'qty', ''], ['b', '2', ''], ['a', '1', ''], ['c', '3', '']]);
    const user = userEvent.setup();
    await click(0);
    await menu('Filter');
    await user.click(document.querySelectorAll('tbody button')[0]);

    // Uncheck everything, then pick just "a".
    const boxes = () => [...document.querySelectorAll('[class*="filter-menu"] input[type="checkbox"]')] as HTMLInputElement[];
    await user.click(boxes()[0]); // (Select All) -> none
    const labels = [...document.querySelectorAll('[class*="filter-list"] label')];
    await user.click(labels.find(l => l.textContent === 'a')!.querySelector('input')!);
    await user.click([...document.querySelectorAll('[class*="filter-actions"] button')].find(b => b.textContent === 'Apply')!);

    // "b" and "c" drop out; the header, "a" and the blank rows below stay.
    expect(document.querySelectorAll('tbody tr')).toHaveLength(18);
    // The header cell also holds the filter button, so read its text span.
    expect(document.querySelectorAll('tbody td span')[0]).toHaveTextContent('name');
    expect(document.querySelectorAll('tbody td')[3]).toHaveTextContent('a');
  });

  it('turns filtering off again from the menu, unhiding everything', async () => {
    const {userEvent} = setup([['name', 'qty', ''], ['b', '2', ''], ['a', '1', '']]);
    const user = userEvent.setup();
    await click(0);
    await menu('Filter');
    await user.click(document.querySelectorAll('tbody button')[1]);
    const boxes = [...document.querySelectorAll('[class*="filter-menu"] input[type="checkbox"]')] as HTMLInputElement[];
    await user.click(boxes[0]); // clear all values
    await user.click([...document.querySelectorAll('[class*="filter-actions"] button')].find(b => b.textContent === 'Apply')!);
    expect(document.querySelectorAll('tbody tr').length).toBeLessThan(20);

    await menu('Filter');
    expect(document.querySelectorAll('tbody tr')).toHaveLength(20);
    expect(document.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('summarises a multi-cell selection and hides the bar for a single cell', async () => {
    const {userEvent} = setup([['1', '2', 'x'], ['3', '4', '']]);
    const user = userEvent.setup();
    await click(0);
    // One cell: nothing worth reporting, so no bar.
    expect(document.body).not.toHaveTextContent(/Count/);

    await user.keyboard('{Shift>}{ArrowRight}{ArrowDown}{/Shift}');
    const bar = document.body.textContent ?? '';
    expect(bar).toContain('Count 4');
    expect(bar).toContain('Sum 10');
    expect(bar).toContain('Average 2.5');
  });

  it('leaves filtered-out rows out of the summary', async () => {
    const {userEvent} = setup([['name', 'qty', ''], ['a', '1', ''], ['b', '100', '']]);
    const user = userEvent.setup();
    await click(0);
    await menu('Filter');
    await user.click(document.querySelectorAll('tbody button')[0]);
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    await user.click(boxes[0]); // clear all
    const labels = [...document.querySelectorAll('li label')];
    await user.click(labels.find(l => l.textContent === 'a')!.querySelector('input')!);
    await user.click([...document.querySelectorAll('button')].find(b => b.textContent === 'Apply')!);

    await click(1); // qty header
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}');
    // Only the visible "a" row contributes, so the 100 never lands in the sum.
    expect(document.body).toHaveTextContent(/Sum 1/);
    expect(document.body).not.toHaveTextContent(/Sum 101/);
  });

  it('sorts only the visible rows, leaving filtered-out ones where they are', async () => {
    // Only "b" passes the filter, so a sort must not shuffle "a" and "c".
    setup(
      [['n', 'v', ''], ['c', '1', ''], ['b', '2', ''], ['a', '1', '']],
      {},
      {filters: JSON.stringify({1: {values: ['2']}})}
    );
    await click(0);
    await menu('Sort A → Z');
    await menu('Filter'); // turn filtering off to reveal the underlying order
    expect(shownRows().slice(0, 4)).toEqual(['n|v|', 'c|1|', 'b|2|', 'a|1|']);
  });

  it('undoes turning a filter on', async () => {
    setup([['n', 'v', ''], ['a', '1', '']]);
    await click(0);
    await menu('Filter');
    expect(document.querySelectorAll('tbody button')).toHaveLength(2);

    fireEvent.keyDown(scroller(), {key: 'z', ctrlKey: true});
    expect(document.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('pastes into visible rows only, stepping over the hidden ones', async () => {
    setup(
      [['n', 'v', ''], ['x', '1', ''], ['y', '2', ''], ['z', '2', '']],
      {},
      {filters: JSON.stringify({1: {values: ['2']}})}
    );
    await click(0);
    fireEvent.paste(scroller(), {clipboardData: {getData: (t: string) => (t === 'text/plain' ? ['P', 'Q', 'R'].join('\n') : '')}});
    await menu('Filter');
    // "x" is untouched because its row was hidden when the paste landed.
    expect(shownRows().slice(0, 4)).toEqual(['P|v|', 'x|1|', 'Q|2|', 'R|2|']);
  });

  it('moves a column filter when a column is inserted before it', async () => {
    setup(
      [['n', 'v', ''], ['a', '1', ''], ['b', '2', '']],
      {},
      {filters: JSON.stringify({1: {values: ['2']}})}
    );
    await cells();
    // The filter is on column v, so only the "b" record shows.
    expect(shownRows()[1]).toBe('b|2|');

    await click(0);
    await menu('Insert Column Left');
    // The filter followed the column it was on, so "b" is still the visible one.
    expect(shownRows()[1]).toBe('|b|2|');
  });

  it('fills a lone cell from the one above with Ctrl+D', async () => {
    setup([['7', '', ''], ['', '', '']]);
    await click(3); // A2
    fireEvent.keyDown(scroller(), {key: 'd', ctrlKey: true});
    expect(await sheetText(3)).toBe('7');
  });

  it('renders only the rows in view on a tall sheet', async () => {
    // 400px of viewport at 24px a row is about 17 rows, plus overscan either
    // side — nowhere near the 1000 the sheet holds.
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 400});
    try {
      setup(undefined, {rows: 1000});
      await cells();
      const rendered = document.querySelectorAll('tbody tr').length;
      expect(rendered).toBeGreaterThan(5);
      expect(rendered).toBeLessThan(60);

      // The spacer keeps the scrollbar honest about the full height.
      const spacer = [...document.querySelectorAll('tbody tr')].filter(r => r.getAttribute('aria-hidden') !== null);
      expect(spacer.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 2000});
    }
  });

  it('starts a new sheet with the configured number of rows', async () => {
    setup(undefined, {rows: 5});
    await cells();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('scrolls the active cell into view when it moves past the viewport', async () => {
    // A short viewport, so moving down a few rows leaves it.
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 120});
    try {
      setup(undefined, {rows: 100});
      await cells();
      const sc = scroller();
      expect(sc.scrollTop).toBe(0);

      await click(0);
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(sc, {key: 'ArrowDown'});
      }
      // Row 13 at 24px a row sits below a 120px viewport, so it scrolled.
      expect(sc.scrollTop).toBeGreaterThan(0);

      // Coming back up scrolls the other way.
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(sc, {key: 'ArrowUp'});
      }
      expect(sc.scrollTop).toBe(0);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {configurable: true, get: () => 2000});
    }
  });

  it('leaves the scroll alone while the active cell is already visible', async () => {
    setup(undefined, {rows: 100});
    await cells();
    const sc = scroller();
    await click(0);
    fireEvent.keyDown(sc, {key: 'ArrowDown'});
    expect(sc.scrollTop).toBe(0);
  });
});
