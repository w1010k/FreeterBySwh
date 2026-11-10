/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createMoveShelfItemUseCase } from '@/application/useCases/shelf/moveShelfItem';
import { fixtureWidgetListItemA, fixtureWidgetListItemB } from '@tests/base/fixtures/widgetList';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureShelf } from '@tests/base/state/fixtures/shelf';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup() {
  const a = fixtureWidgetListItemA();
  const b = fixtureWidgetListItemB();
  const [appStore] = await fixtureAppStore(fixtureAppState({ ui: { shelf: fixtureShelf({ widgetList: [a, b] }) } }));
  return { appStore, a, b, moveShelfItemUseCase: createMoveShelfItemUseCase({ appStore }) };
}

describe('moveShelfItemUseCase()', () => {
  it('moves an item one place left or right', async () => {
    const { appStore, a, b, moveShelfItemUseCase } = await setup();

    moveShelfItemUseCase(a.id, 1);
    expect(appStore.get().ui.shelf.widgetList.map(item => item.id)).toEqual([b.id, a.id]);

    moveShelfItemUseCase(a.id, -1);
    expect(appStore.get().ui.shelf.widgetList.map(item => item.id)).toEqual([a.id, b.id]);
  });

  it('does nothing past either end or for an unknown item', async () => {
    const { appStore, a, b, moveShelfItemUseCase } = await setup();
    const state = appStore.get();

    moveShelfItemUseCase(a.id, -1);
    moveShelfItemUseCase(b.id, 1);
    moveShelfItemUseCase('NO-SUCH-ID', 1);

    expect(appStore.get()).toBe(state);
  });
});
