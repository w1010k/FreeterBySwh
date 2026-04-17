/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { ClipboardProvider } from '@/application/interfaces/clipboardProvider';
import { ProcessProvider } from '@/application/interfaces/processProvider';
import { ShellProvider } from '@/application/interfaces/shellProvider';
import { DataStorageRenderer } from '@/application/interfaces/dataStorage';
import { EntityId } from '@/base/entity';
import { WidgetApiExposeApiHandler, WidgetApiModuleName, WidgetApiSetContextMenuFactoryHandler, WidgetApiUpdateActionBarHandler, createWidgetApiFactory } from '@/base/widgetApi';
import { ObjectManager } from '@common/base/objectManager';
import { TerminalProvider } from '@/application/interfaces/terminalProvider';
import { GetWidgetsInCurrentWorkflowUseCase } from '@/application/useCases/widget/widgetApiWidgets/getWidgetsInCurrentWorkflow';
import { AppStore } from '@/application/interfaces/store';
import { resolveWidgetSharedKeyId } from '@/base/widget';
import { sharedStorageId } from '@common/base/sharedStorageId';

interface Deps {
  appStore: AppStore;
  clipboardProvider: ClipboardProvider;
  widgetDataStorageManager: ObjectManager<DataStorageRenderer>;
  sharedDataStorageManager: ObjectManager<DataStorageRenderer>;
  processProvider: ProcessProvider;
  shellProvider: ShellProvider;
  terminalProvider: TerminalProvider;
  getWidgetsInCurrentWorkflowUseCase: GetWidgetsInCurrentWorkflowUseCase;
}
function _createWidgetApiFactory({
  appStore,
  clipboardProvider,
  processProvider,
  shellProvider,
  widgetDataStorageManager,
  sharedDataStorageManager,
  terminalProvider,
  getWidgetsInCurrentWorkflowUseCase,
}: Deps, forPreview: boolean) {
  return createWidgetApiFactory(
    (_widgetId, updateActionBarHandler, setWidgetContextMenuFactoryHandler, exposeApiHandler) => ({
      updateActionBar: !forPreview ? (actionBarItems) => {
        updateActionBarHandler(actionBarItems);
      } : () => undefined,
      setContextMenuFactory: !forPreview ? (factory) => {
        setWidgetContextMenuFactoryHandler(factory);
      } : () => undefined,
      exposeApi: !forPreview ? (api) => {
        exposeApiHandler(api)
      } : () => undefined,
    }),
    {
      clipboard: () => ({
        writeBookmark: (title, url) => clipboardProvider.writeBookmark(title, url),
        writeText: (text) => clipboardProvider.writeText(text)
      }),
      dataStorage: (widgetId) => {
        // Resolve the storage lazily on every call so a settings change
        // (e.g. toggling a shared key on/off) is picked up without having to
        // rebuild the widget's cached widgetApi object.
        const getStorage = () => {
          const widget = appStore.get().entities.widgets[widgetId];
          const sharedKey = widget ? resolveWidgetSharedKeyId(widget) : null;
          if (sharedKey) {
            return sharedDataStorageManager.getObject(sharedStorageId(widget!.type, sharedKey));
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
      shell: () => ({
        openApp: (appPath, args) => shellProvider.openApp(appPath, args),
        openExternalUrl: (url) => shellProvider.openExternal(url),
        openPath: (path) => shellProvider.openPath(path)
      }),
      terminal: () => ({
        execCmdLines: (cmdLines, cwd) => terminalProvider.execCmdLines(cmdLines, cwd)
      }),
      widgets: () => ({
        getWidgetsInCurrentWorkflow: (widgetTypeId) => getWidgetsInCurrentWorkflowUseCase(widgetTypeId)
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
    requiredModules: WidgetApiModuleName[]
  ) {
    return forPreview
      ? widgetApiPreviewFactory(widgetId, updateActionBarHandler, setContextMenuFactoryHandler, exposeApiHandler, requiredModules)
      : widgetApiFactory(widgetId, updateActionBarHandler, setContextMenuFactoryHandler, exposeApiHandler, requiredModules);
  }

  return getWidgetApiUseCase;
}

export type GetWidgetApiUseCase = ReturnType<typeof createGetWidgetApiUseCase>;
