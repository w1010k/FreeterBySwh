/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { MenuItems } from '@common/base/menu';
import { TrayMenuProvider } from '@/application/interfaces/trayMenuProvider';
import { AppStore } from '@/application/interfaces/store';
import { mapIdListToEntityList } from '@/base/entityList';
import { SwitchProjectUseCase } from '@/application/useCases/projectSwitcher/switchProject';
import { ShowBrowserWindowUseCase } from '@/application/useCases/browserWindow/showBrowserWindow';

type Deps = {
  appStore: AppStore;
  trayMenu: TrayMenuProvider;
  switchProjectUseCase: SwitchProjectUseCase;
  showBrowserWindowUseCase: ShowBrowserWindowUseCase;
}

export function createInitTrayMenuUseCase({
  appStore,
  trayMenu,
  switchProjectUseCase,
  showBrowserWindowUseCase,
}: Deps) {
  const initTrayMenuUseCase = () => {
    appStore.subscribe(state => ({
      isLoading: state.isLoading,
      projectIds: state.ui.projectSwitcher.projectIds,
      currentProjectId: state.ui.projectSwitcher.currentProjectId,
      // Labels come from the project entities: a rename-only save keeps the
      // `projectIds` reference, so without this the tray kept the old name.
      // Only the names are compared (as one string): a project entity is also
      // replaced on every workflow switch, which must not rebuild the menu.
      projectNames: JSON.stringify(state.ui.projectSwitcher.projectIds.map(id => state.entities.projects[id]?.settings.name)),
    }), ({
      isLoading,
      currentProjectId,
      projectIds
    }) => {
      if (!isLoading) {
        const items: MenuItems = mapIdListToEntityList(appStore.get().entities.projects, projectIds).map(item => ({
          label: item.settings.name,
          doAction: async () => {
            showBrowserWindowUseCase();
            switchProjectUseCase(item.id);
          },
          type: item.id === currentProjectId ? 'radio' : 'normal'
        }));

        trayMenu.setMenu(items)
      }
    }, { fireImmediately: true });
  }

  return initTrayMenuUseCase;
}

export type InitTrayMenuUseCase = ReturnType<typeof createInitTrayMenuUseCase>;
