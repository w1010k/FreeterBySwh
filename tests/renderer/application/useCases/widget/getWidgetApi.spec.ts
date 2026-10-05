/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';
import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { ProcessProvider } from '@/application/interfaces/processProvider';
import { TerminalProvider } from '@/application/interfaces/terminalProvider';
import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';
import { createGetWidgetApiUseCase } from '@/application/useCases/widget/getWidgetApi';
import { ActionBarItems } from '@/base/actionBar';
import { WidgetContextMenuFactory } from '@/base/widget';
import { WidgetApi, WidgetApiModuleName } from '@/base/widgetApi';
import { ObjectManager, createObjectManager } from '@common/base/objectManager';
import { ProcessInfo } from '@common/base/process';
import { mockShellProvider } from '@tests/infra/mocks/shellProvider';
import { mockFsProvider } from '@tests/infra/mocks/fsProvider';
import { mockIconProvider } from '@tests/infra/mocks/iconProvider';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureWidgetA } from '@tests/base/fixtures/widget';
import { fixtureWorkflowA } from '@tests/base/fixtures/workflow';
import { fixtureProjectA, fixtureProjectB } from '@tests/base/fixtures/project';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { sharedStorageId } from '@common/base/sharedStorageId';

const widgetId = 'WIDGET-ID';

async function setup() {
  const clipboardProvider: jest.MockedObject<ClipboardProvider> = {
    writeBookmark: jest.fn(),
    writeText: jest.fn(),
  }
  const processProvider: jest.MockedObject<ProcessProvider> = {
    getProcessInfo: jest.fn()
  }
  const shellProvider = mockShellProvider({
    openApp: jest.fn(),
    openExternal: jest.fn(),
    openPath: jest.fn()
  });
  const fsProvider = mockFsProvider({
    readDir: jest.fn(),
    getHomeDir: jest.fn()
  });
  const iconProvider = mockIconProvider({
    getFileIcon: jest.fn(),
    getFavicon: jest.fn()
  });

  const widgetDataStorage: jest.MockedObject<DataStorageRenderer> = {
    clear: jest.fn(),
    getKeys: jest.fn(),
    getText: jest.fn(),
    deleteItem: jest.fn(),
    setText: jest.fn(),
    getJson: jest.fn(),
    setJson: jest.fn()
  };
  const widgetDataStorageManager: ObjectManager<jest.MockedObject<DataStorageRenderer>> = createObjectManager(
    async () => widgetDataStorage,
    async () => true
  )

  const sharedDataStorage: jest.MockedObject<DataStorageRenderer> = {
    clear: jest.fn(),
    getKeys: jest.fn(),
    getText: jest.fn(),
    deleteItem: jest.fn(),
    setText: jest.fn(),
    getJson: jest.fn(),
    setJson: jest.fn()
  };
  const sharedDataStorageManager: ObjectManager<jest.MockedObject<DataStorageRenderer>> = createObjectManager(
    async () => sharedDataStorage,
    async () => true
  )

  const terminalProvider: jest.MockedObject<TerminalProvider> = {
    execCmdLines: jest.fn()
  }

  const systemStatsProvider: jest.MockedObject<SystemStatsProvider> = {
    getStats: jest.fn()
  }

  const getWidgetsInCurrentWorkflowUseCase = jest.fn();

  const [appStore] = await fixtureAppStore(fixtureAppState({}));

  const getWidgetApiUseCase = createGetWidgetApiUseCase({
    appStore,
    clipboardProvider,
    processProvider,
    shellProvider,
    fsProvider,
    iconProvider,
    widgetDataStorageManager,
    sharedDataStorageManager,
    terminalProvider,
    systemStatsProvider,
    getWidgetsInCurrentWorkflowUseCase,
  });
  return {
    appStore,
    clipboardProvider,
    processProvider,
    shellProvider,
    fsProvider,
    iconProvider,
    widgetDataStorage,
    widgetDataStorageManager,
    sharedDataStorage,
    sharedDataStorageManager,
    terminalProvider,
    getWidgetsInCurrentWorkflowUseCase,

    getWidgetApiUseCase
  }
}

describe('getWidgetApiUseCase()', () => {
  it.each<[WidgetApiModuleName[], Partial<WidgetApi>]>([
    [[], {
      updateActionBar: expect.any(Function),
      setHeaderTabs: expect.any(Function),
      setContextMenuFactory: expect.any(Function),
      exposeApi: expect.any(Function),
      setDynamicTitle: expect.any(Function),
      logActivity: expect.any(Function),
    }],
    [['clipboard'], {
      updateActionBar: expect.any(Function),
      setHeaderTabs: expect.any(Function),
      setContextMenuFactory: expect.any(Function),
      exposeApi: expect.any(Function),
      setDynamicTitle: expect.any(Function),
      logActivity: expect.any(Function),
      clipboard: expect.any(Object)
    }],
    [['dataStorage', 'shell'], {
      updateActionBar: expect.any(Function),
      setHeaderTabs: expect.any(Function),
      setContextMenuFactory: expect.any(Function),
      exposeApi: expect.any(Function),
      setDynamicTitle: expect.any(Function),
      logActivity: expect.any(Function),
      dataStorage: expect.any(Object),
      shell: expect.any(Object)
    }],
    [['icon'], {
      updateActionBar: expect.any(Function),
      setHeaderTabs: expect.any(Function),
      setContextMenuFactory: expect.any(Function),
      exposeApi: expect.any(Function),
      setDynamicTitle: expect.any(Function),
      logActivity: expect.any(Function),
      icon: expect.any(Object)
    }],
  ])('should correctly add common properties and required modules to WidgetApi, when requiredModules = %j', async (requiredModules, expectWidgetApi) => {
    const {
      getWidgetApiUseCase
    } = await setup()

    const widgetApi = getWidgetApiUseCase('WIDGET-ID', false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, requiredModules);

    expect(widgetApi).toEqual(expectWidgetApi);
  })

  it('should correctly setup common properties, when forPreview is false', async () => {
    const {
      getWidgetApiUseCase,
    } = await setup()
    const testVal = 'TEST-VALUE';
    const updateWidgetActionBarHandler = jest.fn();
    const setContextMenuFactoryHandler = jest.fn();
    const exposeApiHandler = jest.fn();
    const setDynamicTitleHandler = jest.fn();
    const setHeaderTabsHandler = jest.fn();

    const widgetApi = getWidgetApiUseCase(
      widgetId,
      false,
      updateWidgetActionBarHandler,
      setContextMenuFactoryHandler,
      exposeApiHandler,
      setDynamicTitleHandler,
      () => undefined,
      setHeaderTabsHandler,
      []
    );

    widgetApi.setContextMenuFactory(testVal as unknown as WidgetContextMenuFactory);
    expect(setContextMenuFactoryHandler).toHaveBeenCalledTimes(1);
    expect(setContextMenuFactoryHandler).toHaveBeenCalledWith(testVal);

    widgetApi.updateActionBar(testVal as unknown as ActionBarItems);
    expect(updateWidgetActionBarHandler).toHaveBeenCalledTimes(1);
    expect(updateWidgetActionBarHandler).toHaveBeenCalledWith(testVal);

    widgetApi.exposeApi(testVal as unknown as object);
    expect(exposeApiHandler).toHaveBeenCalledTimes(1);
    expect(exposeApiHandler).toHaveBeenCalledWith(testVal);

    widgetApi.setDynamicTitle(testVal);
    expect(setDynamicTitleHandler).toHaveBeenCalledTimes(1);
    expect(setDynamicTitleHandler).toHaveBeenCalledWith(testVal);

    widgetApi.setHeaderTabs(null);
    expect(setHeaderTabsHandler).toHaveBeenCalledTimes(1);
    expect(setHeaderTabsHandler).toHaveBeenCalledWith(null);
  })

  it('should correctly setup common properties, when forPreview is true', async () => {
    const {
      getWidgetApiUseCase,
    } = await setup()
    const testVal = 'TEST-VALUE';
    const updateWidgetActionBarHandler = jest.fn();
    const setContextMenuFactoryHandler = jest.fn();
    const exposeApiHandler = jest.fn();
    const setDynamicTitleHandler = jest.fn();
    const setHeaderTabsHandler = jest.fn();

    const widgetApi = getWidgetApiUseCase(
      widgetId,
      true,
      updateWidgetActionBarHandler,
      setContextMenuFactoryHandler,
      exposeApiHandler,
      setDynamicTitleHandler,
      () => undefined,
      setHeaderTabsHandler,
      []
    );

    widgetApi.setContextMenuFactory(testVal as unknown as WidgetContextMenuFactory);
    expect(setContextMenuFactoryHandler).not.toHaveBeenCalled();

    widgetApi.updateActionBar(testVal as unknown as ActionBarItems);
    expect(updateWidgetActionBarHandler).not.toHaveBeenCalled();

    widgetApi.exposeApi(testVal as unknown as object);
    expect(exposeApiHandler).not.toHaveBeenCalled();

    widgetApi.setDynamicTitle(testVal);
    expect(setDynamicTitleHandler).not.toHaveBeenCalled();

    widgetApi.setHeaderTabs(null);
    expect(setHeaderTabsHandler).not.toHaveBeenCalled();
  })

  it('should correctly setup clipboard module', async () => {
    const {
      getWidgetApiUseCase,
      clipboardProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['clipboard']);

    widgetApi.clipboard.writeBookmark('title', 'url');
    expect(clipboardProvider.writeBookmark).toHaveBeenCalledTimes(1);
    expect(clipboardProvider.writeBookmark).toHaveBeenCalledWith('title', 'url');

    widgetApi.clipboard.writeText('text');
    expect(clipboardProvider.writeText).toHaveBeenCalledTimes(1);
    expect(clipboardProvider.writeText).toHaveBeenCalledWith('text');
  })

  it('should correctly setup dataStorage module', async () => {
    const {
      getWidgetApiUseCase,
      widgetDataStorageManager
    } = await setup()
    const testVal = 'TEST-VALUE';
    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['dataStorage']);
    const widgetDataStorage = await widgetDataStorageManager.getObject(widgetId);

    await widgetApi.dataStorage.clear();
    expect(widgetDataStorage.clear).toHaveBeenCalledTimes(1);
    expect(widgetDataStorage.clear).toHaveBeenCalledWith();

    widgetDataStorage.getText.mockResolvedValue(testVal);
    expect(await widgetApi.dataStorage.getText('key')).toBe(testVal);
    expect(widgetDataStorage.getText).toHaveBeenCalledTimes(1);
    expect(widgetDataStorage.getText).toHaveBeenCalledWith('key');

    await widgetApi.dataStorage.remove('key');
    expect(widgetDataStorage.deleteItem).toHaveBeenCalledTimes(1);
    expect(widgetDataStorage.deleteItem).toHaveBeenCalledWith('key');

    await widgetApi.dataStorage.setText('key', 'value');
    expect(widgetDataStorage.setText).toHaveBeenCalledTimes(1);
    expect(widgetDataStorage.setText).toHaveBeenCalledWith('key', 'value');
  })

  it('should correctly setup process module', async () => {
    const {
      getWidgetApiUseCase,
      processProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['process']);

    const processInfo = { some: 'info' } as unknown as ProcessInfo;
    processProvider.getProcessInfo.mockReturnValue(processInfo)
    expect(widgetApi.process.getProcessInfo()).toBe(processInfo);
    expect(processProvider.getProcessInfo).toHaveBeenCalledTimes(1);
    expect(processProvider.getProcessInfo).toHaveBeenCalledWith();
  })

  it('should correctly setup shell module', async () => {
    const {
      getWidgetApiUseCase,
      shellProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['shell']);

    widgetApi.shell.openApp('app/path', ['arg1', 'arg2']);
    expect(shellProvider.openApp).toHaveBeenCalledTimes(1);
    expect(shellProvider.openApp).toHaveBeenCalledWith('app/path', ['arg1', 'arg2']);

    widgetApi.shell.openExternalUrl('test://url');
    expect(shellProvider.openExternal).toHaveBeenCalledTimes(1);
    expect(shellProvider.openExternal).toHaveBeenCalledWith('test://url');

    widgetApi.shell.openPath('some/file/path');
    expect(shellProvider.openPath).toHaveBeenCalledTimes(1);
    expect(shellProvider.openPath).toHaveBeenCalledWith('some/file/path');
  })

  it('should correctly setup fs module', async () => {
    const {
      getWidgetApiUseCase,
      fsProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['fs']);

    widgetApi.fs.readDir('/some/dir');
    expect(fsProvider.readDir).toHaveBeenLastCalledWith('/some/dir', undefined);

    const opts = { includeHidden: false, includeSizes: false };
    widgetApi.fs.readDir('/some/dir', opts);
    expect(fsProvider.readDir).toHaveBeenLastCalledWith('/some/dir', opts);

    widgetApi.fs.getHomeDir();
    expect(fsProvider.getHomeDir).toHaveBeenCalledTimes(1);

    widgetApi.fs.readTextFile('/d/a.md');
    expect(fsProvider.readTextFile).toHaveBeenLastCalledWith('/d/a.md');
    widgetApi.fs.writeTextFile('/d/a.md', 'text');
    expect(fsProvider.writeTextFile).toHaveBeenLastCalledWith('/d/a.md', 'text');
    widgetApi.fs.getMtime('/d/a.md');
    expect(fsProvider.getMtime).toHaveBeenLastCalledWith('/d/a.md');
  })

  it('should correctly setup icon module', async () => {
    const {
      getWidgetApiUseCase,
      iconProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['icon']);

    widgetApi.icon.getFileIcon('/some/path');
    expect(iconProvider.getFileIcon).toHaveBeenLastCalledWith('/some/path', undefined);

    widgetApi.icon.getFileIcon('/some/path', true);
    expect(iconProvider.getFileIcon).toHaveBeenLastCalledWith('/some/path', true);

    widgetApi.icon.getFavicon('https://example.com');
    expect(iconProvider.getFavicon).toHaveBeenLastCalledWith('https://example.com', undefined);

    widgetApi.icon.getFavicon('https://example.com', true);
    expect(iconProvider.getFavicon).toHaveBeenLastCalledWith('https://example.com', true);
  })

  it('should correctly setup terminal module', async () => {
    const {
      getWidgetApiUseCase,
      terminalProvider
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['terminal']);

    widgetApi.terminal.execCmdLines(['cmd1', 'cmd2'], 'cwd');
    expect(terminalProvider.execCmdLines).toHaveBeenCalledTimes(1);
    expect(terminalProvider.execCmdLines).toHaveBeenCalledWith(['cmd1', 'cmd2'], 'cwd');
  })

  it('should correctly setup widgets module', async () => {
    const {
      getWidgetApiUseCase,
      getWidgetsInCurrentWorkflowUseCase
    } = await setup()

    const widgetApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['widgets']);

    widgetApi.widgets.getWidgetsInCurrentWorkflow('widget-type');
    expect(getWidgetsInCurrentWorkflowUseCase).toHaveBeenCalledTimes(1);
    expect(getWidgetsInCurrentWorkflowUseCase).toHaveBeenCalledWith('widget-type');
  })

  describe('to-do-list dataStorage scope', () => {
    // Project P holds a workflow with the to-do widget. The widget's API
    // instance resolves its storage once while it sits in P, unless
    // `readFirst` is false (a second same-scope widget skips the disk read).
    async function setupTodoInProject(readFirst = true) {
      const ctx = await setup();
      const workflow = fixtureWorkflowA({ layout: [fixtureWidgetLayoutItemA({ widgetId })] });
      const project = fixtureProjectA({ workflowIds: [workflow.id] });
      const state = ctx.appStore.get();
      ctx.appStore.set({
        ...state,
        entities: {
          ...state.entities,
          projects: { [project.id]: project },
          workflows: { [workflow.id]: workflow },
          widgets: { [widgetId]: fixtureWidgetA({ id: widgetId, type: 'to-do-list' }) },
        }
      });
      const getObject = jest.spyOn(ctx.sharedDataStorageManager, 'getObject');
      const widgetApi = ctx.getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['dataStorage']);
      if (readFirst) {
        await widgetApi.dataStorage.getJson('todo');
        expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', project.id));
      }
      return { ...ctx, getObject, widgetApi, workflow, project };
    }

    it('keeps writing to the project bucket after the widget is deleted', async () => {
      const { appStore, getObject, widgetApi, widgetDataStorage, workflow, project } = await setupTodoInProject();
      const state = appStore.get();
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          workflows: { [workflow.id]: { ...workflow, layout: [] } },
          widgets: {},
        }
      });

      await widgetApi.dataStorage.setJson('todo', { items: [] });

      expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', project.id));
      expect(widgetDataStorage.setJson).not.toHaveBeenCalled();
    })

    it('keeps the old instance on the project bucket after the widget moves to the shelf', async () => {
      const { appStore, getObject, getWidgetApiUseCase, widgetApi, workflow, project } = await setupTodoInProject();
      const state = appStore.get();
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          workflows: { [workflow.id]: { ...workflow, layout: [] } },
        }
      });

      // The workflow instance's pending flush must not land in the shelf list.
      await widgetApi.dataStorage.setJson('todo', { items: [] });
      expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', project.id));

      // The shelf instance gets a new widget API and uses the app bucket.
      const shelfApi = getWidgetApiUseCase(widgetId, false, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, () => undefined, ['dataStorage']);
      await shelfApi.dataStorage.setJson('todo', { items: [] });
      expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', 'app'));
    })
    it('pins the project bucket at API creation, even if the first storage call comes after the move', async () => {
      const { appStore, getObject, widgetApi, workflow, project } = await setupTodoInProject(false);
      const state = appStore.get();
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          workflows: { [workflow.id]: { ...workflow, layout: [] } },
        }
      });

      await widgetApi.dataStorage.setJson('todo', { items: [] });

      expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', project.id));
    })

    it('follows its workflow when the workflow moves to another project', async () => {
      const { appStore, getObject, widgetApi, workflow, project } = await setupTodoInProject();
      const projectB = fixtureProjectB({ workflowIds: [workflow.id] });
      const state = appStore.get();
      appStore.set({
        ...state,
        entities: {
          ...state.entities,
          projects: { [project.id]: { ...project, workflowIds: [] }, [projectB.id]: projectB },
        }
      });

      await widgetApi.dataStorage.setJson('todo', { items: [] });

      expect(getObject).toHaveBeenLastCalledWith(sharedStorageId('to-do-list', projectB.id));
    })
  })

})
