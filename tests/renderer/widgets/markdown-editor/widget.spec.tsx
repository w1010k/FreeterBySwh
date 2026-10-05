/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { Settings } from '@/widgets/markdown-editor/settings';
import { tabsStorageKey, treeRefreshIntervalMs, treeWidthStorageKey, widgetComp } from '@/widgets/markdown-editor/widget';
import { act, fireEvent, screen } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut';
import * as pierreTreesReact from '@pierre/trees/react';
import * as mdxEditor from '@mdxeditor/editor';
import { FsDirEntry } from '@common/base/fs';

const treesMock = pierreTreesReact as unknown as { __getModel: () => { batch: jest.Mock, resetPaths: jest.Mock }, __resetModel: () => void };
const editorMock = mdxEditor as unknown as { __reset: () => void };

const fileEntry = (name: string): FsDirEntry => ({ name, path: `/r/${name}`, isDirectory: false, size: 0 });

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function setupSut(settings: Settings, optional?: SetupWidgetSutOptional) {
  // The shared sut's storage mocks return undefined; the widget awaits them.
  const mockWidgetApi = optional?.mockWidgetApi ?? {};
  const sut = setupWidgetSut(widgetComp, settings, { ...optional, mockWidgetApi: {
    ...mockWidgetApi,
    dataStorage: { getJson: jest.fn(async () => undefined), setJson: jest.fn(async () => undefined), ...mockWidgetApi.dataStorage }
  } });
  await advance(0);
  return sut;
}

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
  treesMock.__resetModel();
  editorMock.__reset();
})

describe('Markdown Editor Widget', () => {
  it('should ask for a folder when none is configured', async () => {
    await setupSut({ folder: ' ' });

    expect(screen.getByText(/no folder configured/i)).toBeInTheDocument();
  })

  it('should list only folders and Markdown files of the folder', async () => {
    const readDir = jest.fn(async () => [fileEntry('a.md'), fileEntry('b.txt'), { name: 'sub', path: '/r/sub', isDirectory: true, size: 0 }]);
    await setupSut({ folder: '/r' }, { mockWidgetApi: { fs: { readDir } } });

    expect(readDir).toHaveBeenCalledWith('/r', { includeHidden: false, includeSizes: false });
    // The tree sorts rows itself; the widget adds them in listing order.
    expect(treesMock.__getModel().batch).toHaveBeenCalledWith([{ type: 'add', path: 'a.md' }, { type: 'add', path: 'sub/' }]);
  })

  it('should restore the stored tabs, one editor per tab with only the active one visible', async () => {
    const getJson = jest.fn(async () => ({ paths: ['/r/a.md', '/r/b.md'], active: '/r/b.md' }));
    const readTextFile = jest.fn(async (path: string) => ({ text: path, mtimeMs: 1 }));
    await setupSut({ folder: '/r' }, { mockWidgetApi: { dataStorage: { getJson }, fs: { readTextFile } } });

    expect(getJson).toHaveBeenCalledWith(tabsStorageKey);
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['a.md×', 'b.md×']);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('b.md');
    const editors = screen.getAllByTestId('mdx-editor');
    expect(editors.map(e => e.textContent)).toEqual(['/r/a.md', '/r/b.md']);
    expect(editors[0].parentElement).not.toBeVisible();
    expect(editors[1].parentElement).toBeVisible();
  })

  it('should open a clicked file in a new tab and store the tabs', async () => {
    const setJson = jest.fn();
    await setupSut({ folder: '/r' }, { mockWidgetApi: {
      fs: { readDir: jest.fn(async () => [fileEntry('a.md')]) },
      dataStorage: { getJson: jest.fn(async () => undefined), setJson }
    } });

    // Stand in for a tree row: the real rows carry these data attributes.
    const row = document.createElement('div');
    row.dataset.itemType = 'file';
    row.dataset.itemPath = 'a.md';
    screen.getByTestId('file-tree').appendChild(row);
    fireEvent.click(row);
    await advance(0);

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('a.md');
    expect(setJson).toHaveBeenLastCalledWith(tabsStorageKey, { paths: ['/r/a.md'], active: '/r/a.md' });
  })

  it('should close a tab with its close button and store the tabs', async () => {
    const setJson = jest.fn();
    await setupSut({ folder: '/r' }, { mockWidgetApi: { dataStorage: {
      getJson: jest.fn(async () => ({ paths: ['/r/a.md', '/r/b.md'], active: '/r/a.md' })),
      setJson
    } } });

    fireEvent.click(screen.getByRole('button', { name: 'Close a.md' }));
    await advance(0);

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['b.md×']);
    expect(setJson).toHaveBeenLastCalledWith(tabsStorageKey, { paths: ['/r/b.md'], active: '/r/b.md' });
  })

  it('should apply added and deleted files on the periodic refresh', async () => {
    const readDir = jest.fn()
      .mockResolvedValueOnce([fileEntry('a.md'), fileEntry('old.md')])
      .mockResolvedValue([fileEntry('a.md'), fileEntry('new.md')]);
    await setupSut({ folder: '/r' }, { mockWidgetApi: { fs: { readDir } } });

    await advance(treeRefreshIntervalMs);

    expect(treesMock.__getModel().batch).toHaveBeenLastCalledWith([{ type: 'remove', path: 'old.md' }, { type: 'add', path: 'new.md' }]);
  })

  it('should restore the stored tree width', async () => {
    const getJson = jest.fn(async (key: string) => key === treeWidthStorageKey ? 300 : undefined);
    await setupSut({ folder: '/r' }, { mockWidgetApi: { dataStorage: { getJson } } });

    expect(screen.getByRole('separator').previousElementSibling).toHaveStyle({ width: '300px' });
  })

  it('should store the tree width changed with the splitter keys', async () => {
    const setJson = jest.fn();
    await setupSut({ folder: '/r' }, { mockWidgetApi: { dataStorage: { setJson } } });

    // jsdom reports a 0 px wide pane, so the width lands on the 80 px minimum.
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });

    expect(setJson).toHaveBeenCalledWith(treeWidthStorageKey, 80);
    expect(screen.getByRole('separator').previousElementSibling).toHaveStyle({ width: '80px' });
  })

  it('should neither restore nor store tabs in the settings preview', async () => {
    const getJson = jest.fn(async () => ({ paths: ['/r/a.md'], active: '/r/a.md' }));
    const setJson = jest.fn();
    await setupSut({ folder: '/r' }, { env: { area: 'shelf', isPreview: true }, mockWidgetApi: {
      fs: { readDir: jest.fn(async () => [fileEntry('b.md')]) },
      dataStorage: { getJson, setJson }
    } });

    expect(getJson).not.toHaveBeenCalledWith(tabsStorageKey);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const row = document.createElement('div');
    row.dataset.itemType = 'file';
    row.dataset.itemPath = 'b.md';
    screen.getByTestId('file-tree').appendChild(row);
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    await advance(0);

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('b.md');
    expect(setJson).not.toHaveBeenCalled();
  })

  it('should show a notice while the folder cannot be read, and load the folder once it can', async () => {
    const readDir = jest.fn()
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValue([fileEntry('a.md')]);
    await setupSut({ folder: '/r' }, { mockWidgetApi: { fs: { readDir } } });
    expect(screen.getByText(/cannot read the folder/i)).toBeInTheDocument();

    await advance(treeRefreshIntervalMs);

    expect(screen.queryByText(/cannot read the folder/i)).not.toBeInTheDocument();
    expect(treesMock.__getModel().batch).toHaveBeenLastCalledWith([{ type: 'add', path: 'a.md' }]);
  })

  it('should drop an old folder notice as soon as that folder loads again', async () => {
    const readDir = jest.fn(async (dir: string) => {
      if (dir === '/a' && readDir.mock.calls.length === 1) {
        throw new Error('ENOENT');
      }
      return [];
    });
    const { setSettings } = await setupSut({ folder: '/a' }, { mockWidgetApi: { fs: { readDir } } });
    expect(screen.getByText(/cannot read the folder/i)).toBeInTheDocument();

    setSettings({ folder: '/b' });
    await advance(0);
    setSettings({ folder: '/a' });
    await advance(0);

    expect(screen.queryByText(/cannot read the folder/i)).not.toBeInTheDocument();
  })
})
