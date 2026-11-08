/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createInitWidgetDeleteHooksUseCase } from '@/application/useCases/widget/initWidgetDeleteHooks';
import { removeManyFromEntityCollection } from '@/base/entityCollection';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';
import { fixtureWidgetAInColl, fixtureWidgetBInColl, fixtureWidgetTypeAInColl, fixtureWidgetTypeBInColl } from '@tests/base/state/fixtures/entitiesState';

describe('initWidgetDeleteHooksUseCase()', () => {
  it('calls onDeleted of the widget type for each widget that leaves the state, and only then', async () => {
    const deleted: string[] = [];
    const state = fixtureAppState({
      entities: {
        widgetTypes: {
          ...fixtureWidgetTypeAInColl({ id: 'T-HOOK', onDeleted: (id: string) => { deleted.push(id); } }),
          ...fixtureWidgetTypeBInColl({ id: 'T-PLAIN' }),
        },
        widgets: {
          ...fixtureWidgetAInColl({ id: 'W1', type: 'T-HOOK' }),
          ...fixtureWidgetBInColl({ id: 'W2', type: 'T-PLAIN' }),
        }
      }
    });
    const [appStore] = await fixtureAppStore(state);
    createInitWidgetDeleteHooksUseCase({ appStore })();

    appStore.set({ ...state, ui: { ...state.ui } });
    expect(deleted).toEqual([]);

    appStore.set({ ...state, entities: { ...state.entities, widgets: removeManyFromEntityCollection(state.entities.widgets, ['W1', 'W2']) } });
    expect(deleted).toEqual(['W1']);
  });
});
