/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { LayoutItemNudge, NudgeLayoutItemUseCase } from '@/application/useCases/worktable/nudgeLayoutItem';
import { ShowWidgetContextMenuUseCase } from '@/application/useCases/widget/showWidgetContextMenu';
import { entityStateActions } from '@/base/state/actions';
import { Widget, WidgetContextMenuFactory, WidgetEnv, WidgetMenuItem, getWidgetDisplayName } from '@/base/widget';
import { ActionBarItem, ActionBarItems } from '@/base/actionBar';
import { WidgetHeaderTabs } from '@/base/widgetApi';
import { UseAppState } from '@/ui/hooks/appState';
import { useWidgetTypeComp } from '@/ui/hooks/useWidgetTypeComp';
import { useCallback, useMemo, useState } from 'react';
import { ReactContextMenuEvent } from '@/ui/types/events';
import { GetWidgetApiUseCase } from '@/application/useCases/widget/getWidgetApi';
import { delete14Svg, more14Svg, settings14Svg } from '@/ui/assets/images/appIcons';
import { OpenWidgetSettingsUseCase } from '@/application/useCases/widgetSettings/openWidgetSettings';
import { DeleteWidgetUseCase } from '@/application/useCases/widget/deleteWidget';
import { EntityId } from '@/base/entity';
import { CopyWidgetUseCase } from '@/application/useCases/widget/copyWidget';
import { ShowContextMenuUseCase } from '@/application/useCases/contextMenu/showContextMenu';
import { createSharedState, sharedStateEquals } from '@/base/state/shared';
import { SetExposedApiUseCase } from '@/application/useCases/widget/setExposedApi';
import { SetWidgetDynamicTitleUseCase } from '@/application/useCases/widget/setWidgetDynamicTitle';
import { LogTelemetryActivityUseCase } from '@/application/useCases/telemetry/logTelemetryActivity';

type Deps = {
  useAppState: UseAppState;
  nudgeLayoutItemUseCase: NudgeLayoutItemUseCase;
  showContextMenuUseCase: ShowContextMenuUseCase;
  showWidgetContextMenuUseCase: ShowWidgetContextMenuUseCase;
  getWidgetApiUseCase: GetWidgetApiUseCase;
  openWidgetSettingsUseCase: OpenWidgetSettingsUseCase;
  deleteWidgetUseCase: DeleteWidgetUseCase;
  copyWidgetUseCase: CopyWidgetUseCase;
  setExposedApiUseCase: SetExposedApiUseCase;
  setWidgetDynamicTitleUseCase: SetWidgetDynamicTitleUseCase;
  logTelemetryActivityUseCase: LogTelemetryActivityUseCase;
}

export interface WidgetProps {
  widget: Widget;
  env: WidgetEnv;
  maximizeAction?: ActionBarItem;
}

function getContextId(el: HTMLElement): string {
  let curEl: HTMLElement | null = el;
  while (curEl) {
    const contextId = curEl.getAttribute('data-widget-context');
    if (contextId !== null) {
      return contextId;
    }
    curEl = curEl.parentElement;
  }
  return '';
}

export function createWidgetViewModelHook({
  useAppState,
  nudgeLayoutItemUseCase,
  showContextMenuUseCase,
  showWidgetContextMenuUseCase,
  getWidgetApiUseCase,
  openWidgetSettingsUseCase,
  deleteWidgetUseCase,
  copyWidgetUseCase,
  setExposedApiUseCase,
  setWidgetDynamicTitleUseCase,
  logTelemetryActivityUseCase,
}: Deps) {
  // Moving and resizing a workflow widget without dragging it (keyboard: the context menu key, or More Actions).
  // One grid cell per step.
  const createLayoutMenuItems = (id: EntityId, env: WidgetEnv): WidgetMenuItem[] => {
    if (env.area !== 'workflow') {
      return [];
    }
    // Read when the menu opens; a step that would change nothing (an edge, the minimum size) is disabled.
    const step = (label: string, nudge: LayoutItemNudge): WidgetMenuItem => ({
      label,
      enabled: nudgeLayoutItemUseCase.canNudge(env.workflowId, id, nudge),
      doAction: async () => nudgeLayoutItemUseCase(env.workflowId, id, nudge),
    });
    return [{
      label: 'Move',
      submenu: [step('Left', { x: -1 }), step('Right', { x: 1 }), step('Up', { y: -1 }), step('Down', { y: 1 })]
    }, {
      label: 'Resize',
      submenu: [step('Wider', { w: 1 }), step('Narrower', { w: -1 }), step('Taller', { h: 1 }), step('Shorter', { h: -1 })]
    }, {
      type: 'separator'
    }];
  };

  function showMoreActions(
    id: EntityId,
    env: WidgetEnv,
  ) {
    // Mirror the action-bar buttons here too: on a small widget the bar truncates
    // and Settings/Delete may not fit, so they must stay reachable from "...".
    showContextMenuUseCase([
      {
        enabled: true,
        label: 'Widget Settings',
        doAction: async () => {
          openWidgetSettingsUseCase(id, env);
        }
      },
      {
        enabled: true,
        label: 'Copy Widget',
        doAction: async () => {
          copyWidgetUseCase(id)
        }
      },
      {
        type: 'separator'
      },
      ...createLayoutMenuItems(id, env),
      {
        enabled: true,
        label: 'Delete Widget',
        doAction: async () => {
          deleteWidgetUseCase(id, env);
        }
      }
    ])
  }
  const createActionBarItemsEditMode: (id: EntityId, env: WidgetEnv) => ActionBarItems = (id, env) => [{
    enabled: true,
    icon: settings14Svg,
    id: 'WIDGET-SETTINGS',
    title: 'Widget Settings',
    doAction: async () => {
      openWidgetSettingsUseCase(id, env);
    }
  }, {
    enabled: true,
    icon: delete14Svg,
    id: 'DELETE-WIDGET',
    title: 'Delete Widget',
    doAction: async () => {
      deleteWidgetUseCase(id, env);
    }
  }, {
    enabled: true,
    icon: more14Svg,
    id: 'MORE-ACTIONS',
    title: 'More Actions',
    doAction: async () => {
      showMoreActions(id, env);
    }
  }]

  const createActionBarCommonItemsViewMode: (
    isMaximizable: boolean,
    maximizeAction: ActionBarItem | undefined
  ) => ActionBarItems = (
    isMaximizable,
    maximizeAction
  ) => {
      const res: ActionBarItem[] = [];
      if (maximizeAction && isMaximizable) {
        res.push(maximizeAction);
      }
      return res;
    }

  const createContextMenuFactoryEditMode: (id: EntityId, env: WidgetEnv) => WidgetContextMenuFactory = (id, env) => () => [{
    enabled: true,
    label: 'Widget Settings',
    doAction: async () => {
      openWidgetSettingsUseCase(id, env);
    }
  }, {
    type: 'separator'
  }, {
    enabled: true,
    label: 'Copy Widget',
    doAction: async () => {
      copyWidgetUseCase(id)
    }
  }, {
    type: 'separator'
  }, ...createLayoutMenuItems(id, env), {
    enabled: true,
    label: 'Delete Widget',
    doAction: async () => {
      deleteWidgetUseCase(id, env);
    }
  }]

  function useViewModel(props: WidgetProps) {
    const { widget, env, maximizeAction } = props;
    // A boolean, not the drag/resize objects: `resizingItem` is replaced on every
    // grid step of a resize, and every mounted widget shell would re-render with it.
    const [
      editMode,
      dontShowActionBar
    ] = useAppState(state => [
      state.ui.editMode,
      !!state.ui.worktable.resizingItem || !!state.ui.dragDrop.from
    ])
    const [actionBarItemsViewMode, setActionBarItemsViewMode] = useState<ActionBarItems>([]);
    const [headerTabs, setHeaderTabs] = useState<WidgetHeaderTabs | null>(null);
    const [contextMenuFactoryViewMode, setContextMenuFactoryViewMode] = useState<WidgetContextMenuFactory | undefined>(undefined);

    const widgetType = useAppState.useWithStrictEq(state => entityStateActions.widgetTypes.getOne(state, widget.type));
    const sharedState = useAppState.useWithCustomEq(state => createSharedState(state, widgetType?.requiresState || []), sharedStateEquals);
    const dynamicTitle = useAppState(state => state.ui.widgetDynamicTitles[widget.id]);
    const WidgetComp = useWidgetTypeComp(widgetType, 'widgetComp');
    const widgetApi = useMemo(() => getWidgetApiUseCase(
      widget.id,
      !!env.isPreview,
      (items) => setActionBarItemsViewMode([...items, ...createActionBarCommonItemsViewMode(widgetType?.maximizable || false, maximizeAction)]),
      (factory: WidgetContextMenuFactory | undefined) => setContextMenuFactoryViewMode(() => factory),
      (api) => setExposedApiUseCase(widget.id, api),
      (title) => setWidgetDynamicTitleUseCase(widget.id, title),
      (type, payload) => logTelemetryActivityUseCase(type, { ...payload, widgetId: widget.id }),
      (tabs) => setHeaderTabs(tabs),
      widgetType?.requiresApi || []
    ), [env.isPreview, maximizeAction, widget.id, widgetType?.maximizable, widgetType?.requiresApi])

    const coreName = widget.coreSettings.name;
    const baseName = getWidgetDisplayName(widget, widgetType);
    const widgetName = coreName !== '' ? coreName : (dynamicTitle || baseName);

    const actionBarItems: ActionBarItems = useMemo(
      () => editMode
        ? createActionBarItemsEditMode(widget.id, env)
        : actionBarItemsViewMode,
      [actionBarItemsViewMode, editMode, env, widget.id]
    );

    const onContextMenuHandler = useCallback((event: ReactContextMenuEvent) => {
      const contextMenuFactory = editMode
        ? createContextMenuFactoryEditMode(widget.id, env)
        : contextMenuFactoryViewMode;
      if (contextMenuFactory) { // prevent default context menu handler
        event.stopPropagation();
      }
      showWidgetContextMenuUseCase(widget.id, contextMenuFactory, getContextId(<HTMLElement>event.target), event.nativeEvent.contextData);
    }, [contextMenuFactoryViewMode, editMode, env, widget.id]);

    const addMenu = headerTabs?.addMenu;
    const onAddMenuClick = useCallback(() => {
      if (addMenu) {
        showContextMenuUseCase(addMenu);
      }
    }, [addMenu]);

    return {
      editMode,
      actionBarItems,
      env,
      widget,
      widgetName,
      headerTabs,
      widgetApi,
      WidgetComp,
      sharedState,
      dontShowActionBar,
      onContextMenuHandler,
      onAddMenuClick,
    }
  }

  return useViewModel;
}

export type WidgetViewModelHook = ReturnType<typeof createWidgetViewModelHook>;
export type WidgetViewModel = ReturnType<WidgetViewModelHook>;
