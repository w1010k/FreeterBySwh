/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';
import { ProcessProvider } from '@/application/interfaces/processProvider';
import { ShellProvider } from '@/application/interfaces/shellProvider';
import { FsProvider } from '@/application/interfaces/fsProvider';
import { IconProvider } from '@/application/interfaces/iconProvider';
import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { EntityId } from '@/base/entity';
import { WidgetApiExposeApiHandler, WidgetApiLogActivityHandler, WidgetApiModuleName, WidgetApiSetContextMenuFactoryHandler, WidgetApiSetDynamicTitleHandler, WidgetApiSetHeaderTabsHandler, WidgetApiUpdateActionBarHandler, createWidgetApiFactory } from '@/base/widgetApi';
import { ObjectManager } from '@common/base/objectManager';
import { TerminalProvider } from '@/application/interfaces/terminalProvider';
import { SystemStatsProvider } from '@/application/interfaces/systemStatsProvider';
import { GetWidgetsInCurrentWorkflowUseCase } from '@/application/useCases/widget/widgetApiWidgets/getWidgetsInCurrentWorkflow';
import { AppStore } from '@/application/interfaces/store';
import { resolveWidgetSharedKeyId } from '@/base/widget';
import { sharedStorageId } from '@common/base/sharedStorageId';
import { AppState } from '@/base/state/app';

const todoListWidgetType = 'to-do-list';
const appScope = 'app';

/**
 * Find the workflow whose layout holds the widget. Returns `null` if the
 * widget lives on the shelf (app-wide) or isn't placed in any workflow.
 */
function findWidgetWorkflowId(state: AppState, widgetId: EntityId): EntityId | null {
  for (const workflow of Object.values(state.entities.workflows)) {
    if (workflow && workflow.layout.some(item => item.widgetId === widgetId)) {
      return workflow.id;
    }
  }
  return null;
}

/** Find the project that lists the workflow, or `null` if none does. */
function findWorkflowProjectId(state: AppState, workflowId: EntityId): EntityId | null {
  for (const project of Object.values(state.entities.projects)) {
    if (project && project.workflowIds.includes(workflowId)) {
      return project.id;
    }
  }
  return null;
}

interface Deps {
  appStore: AppStore;
  clipboardProvider: ClipboardProvider;
  widgetDataStorageManager: ObjectManager<DataStorageRenderer>;
  sharedDataStorageManager: ObjectManager<DataStorageRenderer>;
  processProvider: ProcessProvider;
  shellProvider: ShellProvider;
  fsProvider: FsProvider;
  iconProvider: IconProvider;
  terminalProvider: TerminalProvider;
  systemStatsProvider: SystemStatsProvider;
  getWidgetsInCurrentWorkflowUseCase: GetWidgetsInCurrentWorkflowUseCase;
}
function _createWidgetApiFactory({
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
}: Deps, forPreview: boolean) {
  return createWidgetApiFactory(
    (
      _widgetId,
      updateActionBarHandler,
      setWidgetContextMenuFactoryHandler,
      exposeApiHandler,
      setDynamicTitleHandler,
      logActivityHandler,
      setHeaderTabsHandler
    ) => ({
      updateActionBar: !forPreview ? (actionBarItems) => {
        updateActionBarHandler(actionBarItems);
      } : () => undefined,
      setHeaderTabs: !forPreview ? (tabs) => {
        setHeaderTabsHandler(tabs);
      } : () => undefined,
      setContextMenuFactory: !forPreview ? (factory) => {
        setWidgetContextMenuFactoryHandler(factory);
      } : () => undefined,
      exposeApi: !forPreview ? (api) => {
        exposeApiHandler(api)
      } : () => undefined,
      setDynamicTitle: !forPreview ? (title) => {
        setDynamicTitleHandler(title);
      } : () => undefined,
      logActivity: !forPreview ? (type, payload) => {
        logActivityHandler(type, payload);
      } : () => undefined,
    }),
    {
      clipboard: () => ({
        writeBookmark: (title, url) => clipboardProvider.writeBookmark(title, url),
        writeText: (text) => clipboardProvider.writeText(text)
      }),
      dataStorage: (widgetId) => {
        // To-do scope routing for this widget API instance. One instance
        // belongs to one mounted widget component. Moving the widget to the
        // shelf or to another workflow mounts a new component with a new API,
        // but the old component still flushes its pending save on unmount,
        // and a sibling's debounced save may reuse this instance's closure.
        // Those writes must land in the scope they were queued for. So the
        // instance pins the workflow it sits in when the API is built
        // (`null` = shelf) and derives the project from that workflow on each
        // call. The pin is taken here, not on the first storage call: a
        // second same-scope widget skips the disk read, so its first storage
        // call can be the unmount flush after the move, which would pin the
        // new place. A workflow dragged to another project keeps the
        // component mounted, and its writes follow the workflow to the new
        // project. `undefined` means the widget is not a to-do widget.
        const initState = appStore.get();
        const todoWorkflowId: EntityId | null | undefined = initState.entities.widgets[widgetId]?.type === todoListWidgetType
          ? findWidgetWorkflowId(initState, widgetId)
          : undefined;
        let todoScope = todoWorkflowId ? findWorkflowProjectId(initState, todoWorkflowId) ?? appScope : appScope;
        const resolveTodoScope = (state: AppState) => {
          if (todoWorkflowId === null || todoWorkflowId === undefined) {
            todoScope = appScope;
          } else if (state.entities.workflows[todoWorkflowId]) {
            todoScope = findWorkflowProjectId(state, todoWorkflowId) ?? appScope;
          }
          // Otherwise the workflow was deleted too: keep the last known scope.
          return todoScope;
        };
        // Resolve the storage lazily on every call so a settings change
        // (e.g. toggling a shared key on/off) is picked up without having to
        // rebuild the widget's cached widgetApi object.
        const getStorage = () => {
          const state = appStore.get();
          const widget = state.entities.widgets[widgetId];
          if (!widget) {
            // A deleted to-do widget keeps writing to its scope's bucket.
            return todoWorkflowId !== undefined
              ? sharedDataStorageManager.getObject(sharedStorageId(todoListWidgetType, resolveTodoScope(state)))
              : widgetDataStorageManager.getObject(widgetId);
          }
          const sharedKey = resolveWidgetSharedKeyId(widget);
          if (sharedKey) {
            return sharedDataStorageManager.getObject(sharedStorageId(widget.type, sharedKey));
          }
          // To-do-list is always project-wide-synced without any setting: all
          // todo widgets in the same project (or 'app' scope for shelf) share
          // a single data bucket.
          if (widget.type === todoListWidgetType) {
            return sharedDataStorageManager.getObject(sharedStorageId(todoListWidgetType, resolveTodoScope(state)));
          }
          return widgetDataStorageManager.getObject(widgetId);
        };
        return {
          clear: async () => (await getStorage()).clear(),
          getJson: async (key) => (await getStorage()).getJson(key),
          getText: async (key) => (await getStorage()).getText(key),
          remove: async (key) => (await getStorage()).deleteItem(key),
          setJson: async (key, value) => (await getStorage()).setJson(key, value),
          setText: async (key, value) => (await getStorage()).setText(key, value),
          getKeys: async () => (await getStorage()).getKeys()
        }
      },
      process: () => ({
        getProcessInfo: () => processProvider.getProcessInfo()
      }),
      icon: () => ({
        getFileIcon: (path, bypassCache) => iconProvider.getFileIcon(path, bypassCache),
        getFavicon: (url, bypassCache) => iconProvider.getFavicon(url, bypassCache)
      }),
      shell: () => ({
        openApp: (appPath, args) => shellProvider.openApp(appPath, args),
        openExternalUrl: (url) => shellProvider.openExternal(url),
        openPath: (path) => shellProvider.openPath(path)
      }),
      fs: () => ({
        readDir: (dirPath, opts) => fsProvider.readDir(dirPath, opts),
        getHomeDir: () => fsProvider.getHomeDir(),
        readTextFile: (path) => fsProvider.readTextFile(path),
        writeTextFile: (path, text) => fsProvider.writeTextFile(path, text),
        getMtime: (path) => fsProvider.getMtime(path)
      }),
      terminal: () => ({
        execCmdLines: (cmdLines, cwd) => terminalProvider.execCmdLines(cmdLines, cwd)
      }),
      widgets: () => ({
        getWidgetsInCurrentWorkflow: (widgetTypeId) => getWidgetsInCurrentWorkflowUseCase(widgetTypeId)
      }),
      systemStats: () => ({
        getStats: () => systemStatsProvider.getStats()
      })
    }
  )
}

export function createGetWidgetApiUseCase(deps: Deps) {
  const widgetApiFactory = _createWidgetApiFactory(deps, false);
  const widgetApiPreviewFactory = _createWidgetApiFactory(deps, true);

  function getWidgetApiUseCase(
    widgetId: EntityId,
    forPreview: boolean,
    updateActionBarHandler: WidgetApiUpdateActionBarHandler,
    setContextMenuFactoryHandler: WidgetApiSetContextMenuFactoryHandler,
    exposeApiHandler: WidgetApiExposeApiHandler,
    setDynamicTitleHandler: WidgetApiSetDynamicTitleHandler,
    logActivityHandler: WidgetApiLogActivityHandler,
    setHeaderTabsHandler: WidgetApiSetHeaderTabsHandler,
    requiredModules: WidgetApiModuleName[]
  ) {
    const factory = forPreview ? widgetApiPreviewFactory : widgetApiFactory;
    return factory(
      widgetId,
      updateActionBarHandler,
      setContextMenuFactoryHandler,
      exposeApiHandler,
      setDynamicTitleHandler,
      logActivityHandler,
      setHeaderTabsHandler,
      requiredModules
    );
  }

  return getWidgetApiUseCase;
}

export type GetWidgetApiUseCase = ReturnType<typeof createGetWidgetApiUseCase>;
