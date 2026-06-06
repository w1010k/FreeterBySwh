/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  createSetShelfItemSizeUseCase,
  shelfWidgetMaxH,
  shelfWidgetMaxW,
  shelfWidgetMinH,
  shelfWidgetMinW
} from '@/application/useCases/shelf/setShelfItemSize';
import { AppState } from '@/base/state/app';
import { fixtureWidgetListItemA, fixtureWidgetListItemB } from '@tests/base/fixtures/widgetList';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureShelf } from '@tests/base/state/fixtures/shelf';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup(initState: AppState) {
  const [appStore] = await fixtureAppStore(initState);
  const setShelfItemSizeUseCase = createSetShelfItemSizeUseCase({ appStore });
  return { appStore, setShelfItemSizeUseCase };
}

function stateWithItems(): AppState {
  return fixtureAppState({
    ui: {
      shelf: fixtureShelf({
        widgetList: [fixtureWidgetListItemA({ w: 300, h: 150 }), fixtureWidgetListItemB()]
      })
    }
  })
}

describe('setShelfItemSizeUseCase()', () => {
  it('should set the size of the targeted shelf item only', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());

    setShelfItemSizeUseCase('WL-A', 420, 260);

    const list = appStore.get().ui.shelf.widgetList;
    expect(list[0]).toMatchObject({ id: 'WL-A', w: 420, h: 260 });
    expect(list[1].w).toBeUndefined();
  })

  it('should round fractional sizes', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());

    setShelfItemSizeUseCase('WL-A', 420.7, 260.2);

    expect(appStore.get().ui.shelf.widgetList[0]).toMatchObject({ w: 421, h: 260 });
  })

  it('should clamp below the minimum', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());

    setShelfItemSizeUseCase('WL-A', 1, 1);

    expect(appStore.get().ui.shelf.widgetList[0]).toMatchObject({ w: shelfWidgetMinW, h: shelfWidgetMinH });
  })

  it('should clamp above the maximum', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());

    setShelfItemSizeUseCase('WL-A', 99999, 99999);

    expect(appStore.get().ui.shelf.widgetList[0]).toMatchObject({ w: shelfWidgetMaxW, h: shelfWidgetMaxH });
  })

  it('should not touch the store when the clamped size is unchanged', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());
    const prev = appStore.get();

    setShelfItemSizeUseCase('WL-A', 300, 150);

    expect(appStore.get()).toBe(prev);
  })

  it('should do nothing for an unknown item id', async () => {
    const { appStore, setShelfItemSizeUseCase } = await setup(stateWithItems());
    const prev = appStore.get();

    setShelfItemSizeUseCase('NO-SUCH', 420, 260);

    expect(appStore.get()).toBe(prev);
  })
})
