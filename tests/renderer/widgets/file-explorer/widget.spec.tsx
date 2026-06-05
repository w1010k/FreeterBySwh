/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/file-explorer/settings';
import { widgetComp } from '@/widgets/file-explorer/widget';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut';
// moduleNameMapper redirects this to the manual mock; a plain import (not
// jest.requireMock, which would auto-mock it) yields the same model instance
// the widget uses.
import * as pierreTreesReact from '@pierre/trees/react';

interface MockModel {
  resetPaths: jest.Mock;
  add: jest.Mock;
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

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith(undefined, { preparedInput: { paths: ['Downloads/', 'Documents/'] } });
  })

  it('should disambiguate root nodes that share a basename', () => {
    setupSut(fixtureSettings({ paths: ['/a/src', '/b/src'] }));

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith(undefined, { preparedInput: { paths: ['src/', 'src (2)/'] } });
  })

  it('should ignore empty path entries', () => {
    setupSut(fixtureSettings({ paths: ['', '/home/user/Documents', '  '] }));

    expect(treesMock.__getModel().resetPaths).toHaveBeenCalledWith(undefined, { preparedInput: { paths: ['Documents/'] } });
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

  it('should not open anything on double-click when no row is focused', async () => {
    const openPath = jest.fn(async () => '');

    setupSut(fixtureSettings({ paths: ['/home/user/Downloads'] }), { mockWidgetApi: { shell: { openPath } } });

    await waitFor(() => expect(treesMock.__getModel().resetPaths).toHaveBeenCalled());
    treesMock.__getModel().getFocusedPath.mockReturnValue(null);

    fireEvent.doubleClick(screen.getByTestId('file-tree'));

    expect(openPath).not.toHaveBeenCalled();
  })
})
