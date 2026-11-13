/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/file-explorer/settings';
import { widgetComp } from '@/widgets/file-explorer/widget';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut';
// moduleNameMapper redirects this to the manual mock; a plain import (not
// jest.requireMock, which would auto-mock it) yields the same model instance
// the widget uses.
import * as pierreTreesReact from '@pierre/trees/react';

interface MockModel {
  resetPaths: jest.Mock;
  add: jest.Mock;
  batch: jest.Mock;
  getItem: jest.Mock;
  getFocusedPath: jest.Mock;
  subscribe: jest.Mock<() => void, [() => void]>;
}
const treesMock = pierreTreesReact as unknown as {
  __getModel: () => MockModel;
  __resetModel: () => void;
};

const fixtureSettings = (settings: Partial<Settings>): Settings => ({ paths: [''], showFileSize: true, showHiddenFiles: false, ...settings });

function setupSut(settings: Settings, optional?: SetupWidgetSutOptional) {
  return setupWidgetSut(widgetComp, settings, optional);
}

beforeEach(() => {
  jest.clearAllMocks();
  treesMock.__resetModel();
})

describe('File Explorer Widget', () => {
  it('should render a hint when no folders are configured', () => {
    setupSut(fixtureSettings({ paths: ['', ''] }));

    expect(screen.getByText(/no folders configured/i)).toBeInTheDocument();
  })

  it('should render the configured favorite folders as root directory nodes, preserving registration order', () => {
    // 'Downloads' before 'Documents' is the configured order, NOT alphabetical —
    // roots are fed as presorted input so the tree keeps the user's order.
    setupSut(fixtureSettings({ paths: ['/home/user/Downloads', '/home/user/Documents'] }));

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith({ preparedInput: { paths: ['Downloads/', 'Documents/'] } });
  })

  it('should disambiguate root nodes that share a basename', () => {
    setupSut(fixtureSettings({ paths: ['/a/src', '/b/src'] }));

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith({ preparedInput: { paths: ['src/', 'src (2)/'] } });
  })

  it('should ignore empty path entries', () => {
    setupSut(fixtureSettings({ paths: ['', '/home/user/Documents', '  '] }));

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith({ preparedInput: { paths: ['Documents/'] } });
  })

  it('should NOT open a directory on double-click (reserved for expand/collapse)', async () => {
    const openPath = jest.fn(async () => '');

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { shell: { openPath } } });

    await waitFor(() => expect(treesMock.__getModel().resetPaths).toHaveBeenCalled());
    treesMock.__getModel().getFocusedPath.mockReturnValue('Downloads/');

    fireEvent.doubleClick(screen.getByTestId('file-tree'));

    expect(openPath).not.toHaveBeenCalled();
  })

  it('should open a lazily-loaded file in the OS default app on double-click', async () => {
    const openPath = jest.fn(async () => '');
    const readDir = jest.fn(async () => [{ name: 'a.txt', path: '/home/user/Downloads/a.txt', isDirectory: false, size: 12 }]);
    const model = treesMock.__getModel();
    // Simulate the 'Downloads' favorite being expanded so its file gets loaded.
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { isDirectory: () => true, isExpanded: () => true } : null));

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { fs: { readDir }, shell: { openPath } } });

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());
    // Fire the expansion listener the widget registered via subscribe().
    const loadExpanded = model.subscribe.mock.calls[0][0];
    loadExpanded();
    await waitFor(() => expect(model.add).toHaveBeenCalledWith('Downloads/a.txt'));

    model.getFocusedPath.mockReturnValue('Downloads/a.txt');
    fireEvent.doubleClick(screen.getByTestId('file-tree'));

    expect(openPath).toHaveBeenCalledWith('/home/user/Downloads/a.txt');
  })

  it('should log a file_open activity when a file is opened on double-click', async () => {
    const openPath = jest.fn(async () => '');
    const logActivity = jest.fn();
    const readDir = jest.fn(async () => [{ name: 'a.txt', path: '/home/user/Downloads/a.txt', isDirectory: false, size: 12 }]);
    const model = treesMock.__getModel();
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { isDirectory: () => true, isExpanded: () => true } : null));

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { fs: { readDir }, shell: { openPath }, logActivity } });

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());
    model.subscribe.mock.calls[0][0]();
    await waitFor(() => expect(model.add).toHaveBeenCalledWith('Downloads/a.txt'));

    model.getFocusedPath.mockReturnValue('Downloads/a.txt');
    fireEvent.doubleClick(screen.getByTestId('file-tree'));

    expect(logActivity).toHaveBeenCalledWith('file_open', { text: 'a.txt', detail: '/home/user/Downloads/a.txt' });
  })

  it('should read children with hidden/size options derived from settings', async () => {
    const readDir = jest.fn(async () => []);
    const model = treesMock.__getModel();
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { isDirectory: () => true, isExpanded: () => true } : null));

    setupSut(
      fixtureSettings({ paths: ['/home/user/Downloads'], showFileSize: false, showHiddenFiles: true }),
      { mockWidgetApi: { fs: { readDir } } }
    );

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());
    const loadExpanded = model.subscribe.mock.calls[0][0];
    loadExpanded();

    await waitFor(() => expect(readDir).toHaveBeenCalledWith(
      '/home/user/Downloads',
      { includeHidden: true, includeSizes: false }
    ));
  })

  it('should retry a failed directory read on a later expansion', async () => {
    const readDir = jest.fn()
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValueOnce([{ name: 'a.txt', path: '/home/user/Downloads/a.txt', isDirectory: false, size: 1 }]);
    const model = treesMock.__getModel();
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { isDirectory: () => true, isExpanded: () => true } : null));

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { fs: { readDir } } });

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());
    const loadExpanded = model.subscribe.mock.calls[0][0];

    // First expansion fails; the dir must not stay marked as loaded.
    loadExpanded();
    await waitFor(() => expect(readDir).toHaveBeenCalledTimes(1));

    // Second expansion retries and succeeds.
    loadExpanded();
    await waitFor(() => expect(model.add).toHaveBeenCalledWith('Downloads/a.txt'));
    expect(readDir).toHaveBeenCalledTimes(2);
  })

  it('should re-read directories from disk when Refresh is clicked', async () => {
    const updateActionBar = jest.fn();
    const readDir = jest.fn(async () => [{ name: 'a.txt', path: '/home/user/Downloads/a.txt', isDirectory: false, size: 1 }]);
    const model = treesMock.__getModel();
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { isDirectory: () => true, isExpanded: () => true } : null));

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { updateActionBar, fs: { readDir } } });

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());
    const loadExpanded = model.subscribe.mock.calls[0][0];

    // First expansion reads from disk; a second expansion alone does NOT (cached as loaded).
    loadExpanded();
    await waitFor(() => expect(readDir).toHaveBeenCalledTimes(1));
    loadExpanded();
    expect(readDir).toHaveBeenCalledTimes(1);

    // Refresh clears the cache, so the next expansion reads from disk again.
    const refresh = updateActionBar.mock.calls.at(-1)![0].find((i: { id: string }) => i.id === 'REFRESH');
    await act(async () => { await refresh.doAction(); });
    loadExpanded();
    await waitFor(() => expect(readDir).toHaveBeenCalledTimes(2));
  })

  it('should collapse known directories when Collapse all is clicked', async () => {
    const updateActionBar = jest.fn();
    const collapse = jest.fn();
    const model = treesMock.__getModel();
    model.getItem.mockImplementation((p: string) => (p === 'Downloads/' ? { collapse, isExpanded: () => true } : null));

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { updateActionBar } });

    await waitFor(() => expect(model.resetPaths).toHaveBeenCalled());

    const collapseAll = updateActionBar.mock.calls.at(-1)![0].find((i: { id: string }) => i.id === 'COLLAPSE-ALL');
    await act(async () => { await collapseAll.doAction(); });

    expect(collapse).toHaveBeenCalled();
  })

  it('should not register action bar buttons when no folders are configured', () => {
    const updateActionBar = jest.fn();

    setupSut(fixtureSettings({ paths: ['', ''] }), { mockWidgetApi: { updateActionBar } });

    expect(updateActionBar).toHaveBeenLastCalledWith([]);
  })

  it('should not open anything on double-click when no row is focused', async () => {
    const openPath = jest.fn(async () => '');

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { shell: { openPath } } });

    await waitFor(() => expect(treesMock.__getModel().resetPaths).toHaveBeenCalled());
    treesMock.__getModel().getFocusedPath.mockReturnValue(null);

    fireEvent.doubleClick(screen.getByTestId('file-tree'));

    expect(openPath).not.toHaveBeenCalled();
  })

  describe('search', () => {
    const hits = [
      { name: 'report.txt', path: '/home/user/Documents/2026/report.txt', isDirectory: false, rootIndex: 0, folder: '2026' },
      { name: 'reports', path: '/home/user/Documents/reports', isDirectory: true, rootIndex: 0, folder: '' },
    ];

    function setupSearch(search: jest.Mock = jest.fn(async () => ({ hits, limit: null }))) {
      jest.useFakeTimers();
      const openPath = jest.fn(async () => '');
      const writeText = jest.fn();
      const logActivity = jest.fn();
      const updateActionBar = jest.fn();
      setupSut(fixtureSettings({ paths: ['/home/user/Documents'], showHiddenFiles: false }), {
        mockWidgetApi: { fs: { search }, shell: { openPath }, clipboard: { writeText }, logActivity, updateActionBar }
      });
      return { search, openPath, writeText, logActivity, updateActionBar };
    }
    const typeQuery = async (text: string) => {
      fireEvent.change(screen.getByRole('combobox', { name: 'Search in folders' }), { target: { value: text } });
      await act(async () => { jest.advanceTimersByTime(250); });
    };

    afterEach(() => jest.useRealTimers());

    it('turns off the tree library search (it breaks Korean typing and sees only expanded folders)', () => {
      setupSearch();

      expect(pierreTreesReact.useFileTree).toHaveBeenCalledWith(expect.objectContaining({ search: false }));
    });

    it('opens the search box with Ctrl+F and searches every configured folder after typing pauses', async () => {
      const { search } = setupSearch();

      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      const input = screen.getByRole('combobox', { name: 'Search in folders' });
      expect(input).toHaveFocus();

      await typeQuery(' 보고서 ');

      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith(['/home/user/Documents'], '보고서', { includeHidden: false });
      expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['report.txtDocuments/2026', 'reports/Documents']);
    });

    it('opens the search box from the action bar', async () => {
      const { updateActionBar } = setupSearch();

      const item = updateActionBar.mock.calls.at(-1)![0].find((i: { id: string }) => i.id === 'SEARCH');
      await act(async () => { await item.doAction(); });

      expect(screen.getByRole('combobox', { name: 'Search in folders' })).toBeInTheDocument();
    });

    it('keeps the typed text while an IME composes, and ignores Enter that ends the composition', async () => {
      const { openPath } = setupSearch();
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('보고');
      const input = screen.getByRole('combobox', { name: 'Search in folders' });

      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

      expect(input).toHaveValue('보고');
      expect(openPath).not.toHaveBeenCalled();
    });

    it('moves the selection with the arrow keys and opens it with Enter', async () => {
      const { openPath, logActivity } = setupSearch();
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('rep');
      const input = screen.getByRole('combobox', { name: 'Search in folders' });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(openPath).toHaveBeenCalledWith('/home/user/Documents/reports');
      expect(logActivity).not.toHaveBeenCalled();
    });

    it('opens a file hit on double-click and records it', async () => {
      const { openPath, logActivity } = setupSearch();
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('rep');

      fireEvent.doubleClick(screen.getAllByRole('option')[0]);

      expect(openPath).toHaveBeenCalledWith('/home/user/Documents/2026/report.txt');
      expect(logActivity).toHaveBeenCalledWith('file_open', { text: 'report.txt', detail: '/home/user/Documents/2026/report.txt' });
    });

    it('says when nothing matches, and which limit the search stopped at', async () => {
      const search = jest.fn()
        .mockResolvedValueOnce({ hits: [], limit: null })
        .mockResolvedValueOnce({ hits, limit: 'results' })
        .mockResolvedValueOnce({ hits: [], limit: 'scanned' });
      setupSearch(search);
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });

      await typeQuery('zzz');
      expect(screen.getByRole('status')).toHaveTextContent('No matches.');

      await typeQuery('rep');
      expect(screen.getByRole('status')).toHaveTextContent('Showing the first 2 matches. Type more to narrow the search.');

      // Stopped at the scan limit with no hits: not "No matches" (the file may be in a folder not searched).
      await typeQuery('deep');
      expect(screen.getByRole('status')).toHaveTextContent(/^Stopped early: .*Register smaller folders/);
    });

    it('keeps the last list while the next search runs, and runs one search at a time', async () => {
      let resolveSecond: (v: unknown) => void = () => undefined;
      const search = jest.fn()
        .mockResolvedValueOnce({ hits, limit: null })
        .mockReturnValueOnce(new Promise(r => { resolveSecond = r; }))
        .mockResolvedValueOnce({ hits: [], limit: null });
      setupSearch(search);
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('rep');

      await typeQuery('repo');
      expect(screen.getAllByRole('option')).toHaveLength(2);
      expect(screen.getByRole('status')).toHaveTextContent('Searching…');

      // Still waiting for 'repo': 'repor' is not sent yet.
      await typeQuery('repor');
      expect(search).toHaveBeenCalledTimes(2);

      // 'repo' answers late and is dropped; then only 'repor' is sent.
      await act(async () => { resolveSecond({ hits: [hits[0]], limit: null }); });
      expect(search).toHaveBeenCalledTimes(3);
      expect(search).toHaveBeenLastCalledWith(['/home/user/Documents'], 'repor', { includeHidden: false });
      expect(screen.getByRole('status')).toHaveTextContent('No matches.');
    });

    it('keeps focus in the search box when a result row is clicked', async () => {
      setupSearch();
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('rep');

      const row = screen.getAllByRole('option')[1];
      // fireEvent returns false when the handler prevented the default (the focus move).
      expect(fireEvent.mouseDown(row)).toBe(false);
      fireEvent.click(row);

      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('shows only the answer for the latest query', async () => {
      let resolveFirst: (v: unknown) => void = () => undefined;
      const search = jest.fn()
        .mockReturnValueOnce(new Promise(r => { resolveFirst = r; }))
        .mockResolvedValueOnce({ hits: [hits[1]], limit: null });
      setupSearch(search);
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });

      await typeQuery('re');
      await typeQuery('reports');
      await act(async () => { resolveFirst({ hits, limit: null }); });

      expect(screen.getAllByRole('option')).toHaveLength(1);
    });

    it('exposes the same search for the AI action, with the location the widget shows', async () => {
      const exposeApi = jest.fn();
      const search = jest.fn(async () => ({ hits, limit: 'results' as const }));
      setupSut(fixtureSettings({ paths: ['/home/user/Documents'], showHiddenFiles: true }), { mockWidgetApi: { fs: { search }, exposeApi } });

      const { fileExplorer } = exposeApi.mock.calls.at(-1)![0];
      const res = await fileExplorer.search('rep');

      expect(search).toHaveBeenCalledWith(['/home/user/Documents'], 'rep', { includeHidden: true });
      expect(res).toEqual({
        hits: [
          { name: 'report.txt', path: '/home/user/Documents/2026/report.txt', isDirectory: false, location: 'Documents/2026' },
          { name: 'reports', path: '/home/user/Documents/reports', isDirectory: true, location: 'Documents' },
        ],
        limit: 'results'
      });
    });

    it('runs the AI search after a search box search that is still going, not at the same time', async () => {
      jest.useFakeTimers();
      const exposeApi = jest.fn();
      let resolveBox: (v: unknown) => void = () => undefined;
      const search = jest.fn()
        .mockReturnValueOnce(new Promise(r => { resolveBox = r; }))
        .mockResolvedValueOnce({ hits: [], limit: null });
      setupSut(fixtureSettings({ paths: ['/home/user/Documents'] }), { mockWidgetApi: { fs: { search }, exposeApi } });
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      fireEvent.change(screen.getByRole('combobox', { name: 'Search in folders' }), { target: { value: 'rep' } });
      await act(async () => { jest.advanceTimersByTime(250); });

      const aiRes = exposeApi.mock.calls.at(-1)![0].fileExplorer.search('x');
      await act(async () => undefined);
      expect(search).toHaveBeenCalledTimes(1);

      await act(async () => { resolveBox({ hits, limit: null }); });
      await expect(aiRes).resolves.toEqual({ hits: [], limit: null });
      expect(search).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    describe('hit menu', () => {
      it('opens on right-click with the tree menu items, and copies the path', async () => {
        const { writeText } = setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');

        fireEvent.contextMenu(screen.getAllByRole('option')[0], { clientX: 10, clientY: 20 });

        expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Open Containing Folder' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Copy Path' }));
        expect(writeText).toHaveBeenCalledWith('/home/user/Documents/2026/report.txt');
        expect(screen.queryByRole('button', { name: 'Copy Path' })).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Search in folders' })).toHaveFocus();
      });

      it('offers Open in File Explorer and no containing folder for a folder hit', async () => {
        const { openPath } = setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');

        fireEvent.contextMenu(screen.getAllByRole('option')[1]);
        expect(screen.queryByRole('button', { name: 'Open Containing Folder' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open in File Explorer' }));

        expect(openPath).toHaveBeenCalledWith('/home/user/Documents/reports');
      });

      it('opens for the selected hit with Shift+F10, and closes with Escape back to the search box', async () => {
        setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');
        const input = screen.getByRole('combobox', { name: 'Search in folders' });

        fireEvent.keyDown(input, { key: 'F10', shiftKey: true });
        expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'Escape' });

        expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
        expect(input).toHaveFocus();
        // The menu's Escape does not also close the search.
        expect(input).toBeInTheDocument();
      });

      it('does not let the right-click reach the widget frame (its own edit-mode menu)', async () => {
        setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');
        const frameMenu = jest.fn();
        document.addEventListener('contextmenu', frameMenu);

        fireEvent.contextMenu(screen.getAllByRole('option')[0]);

        document.removeEventListener('contextmenu', frameMenu);
        expect(frameMenu).not.toHaveBeenCalled();
      });

      it('stays inside the window near its edge, and closes on scroll', async () => {
        setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');

        fireEvent.contextMenu(screen.getAllByRole('option')[0], { clientX: window.innerWidth + 500, clientY: window.innerHeight + 500 });
        const menu = screen.getByRole('button', { name: 'Open' }).parentElement!;
        expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth);
        expect(parseFloat(menu.style.top)).toBeLessThanOrEqual(window.innerHeight);

        fireEvent.scroll(document);
        expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
      });

      it('closes on a click outside', async () => {
        setupSearch();
        fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
        await typeQuery('rep');
        fireEvent.contextMenu(screen.getAllByRole('option')[0]);

        fireEvent.mouseDown(document.body);

        expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
      });
    });

    it('closes with Escape and shows the tree again', async () => {
      setupSearch();
      fireEvent.keyDown(screen.getByTestId('file-tree'), { key: 'f', ctrlKey: true });
      await typeQuery('rep');

      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search in folders' }), { key: 'Escape' });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getByTestId('file-tree')).toBeVisible();

      // Focus stays in the widget, so Ctrl+F opens the search again.
      fireEvent.keyDown(document.activeElement!, { key: 'f', ctrlKey: true });
      expect(screen.getByRole('combobox', { name: 'Search in folders' })).toHaveFocus();
    });
  });
})
