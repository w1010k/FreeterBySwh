/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createNudgeLayoutItemUseCase } from '@/application/useCases/worktable/nudgeLayoutItem';
import { fixtureWidgetLayoutItemA } from '@tests/base/fixtures/widgetLayout';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureWidgetAInColl, fixtureWidgetTypeAInColl, fixtureWorkflowAInColl } from '@tests/base/state/fixtures/entitiesState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup(minSize = { w: 1, h: 1 }) {
  const item = fixtureWidgetLayoutItemA({ widgetId: 'W', rect: { x: 2, y: 2, w: 4, h: 3 } });
  const [appStore] = await fixtureAppStore(fixtureAppState({
    entities: {
      workflows: fixtureWorkflowAInColl({ id: 'WF', layout: [item] }),
      widgets: fixtureWidgetAInColl({ id: 'W', type: 'T' }),
      widgetTypes: fixtureWidgetTypeAInColl({ id: 'T', minSize }),
    }
  }));
  const rect = () => appStore.get().entities.workflows['WF']?.layout[0].rect;
  return { appStore, rect, nudge: createNudgeLayoutItemUseCase({ appStore }) };
}

describe('nudgeLayoutItemUseCase()', () => {
  it('moves a widget by grid cells', async () => {
    const { rect, nudge } = await setup();

    nudge('WF', 'W', { x: -1 });
    nudge('WF', 'W', { y: 1 });

    expect(rect()).toEqual({ x: 1, y: 3, w: 4, h: 3 });
  });

  it('resizes a widget by its right and bottom edges, not below the type minimum', async () => {
    const { rect, nudge } = await setup({ w: 4, h: 2 });

    nudge('WF', 'W', { w: 1 });
    nudge('WF', 'W', { h: -1 });
    nudge('WF', 'W', { h: -1 }); // at the minimum height already

    expect(rect()).toEqual({ x: 2, y: 2, w: 5, h: 2 });
  });

  it('does not move past the left or top edge, and does nothing for an unknown widget', async () => {
    const { appStore, nudge } = await setup();
    nudge('WF', 'W', { x: -2, y: -2 });
    const state = appStore.get();

    nudge('WF', 'W', { x: -1 });
    nudge('WF', 'W', { y: -1 });
    nudge('WF', 'NO-SUCH-ID', { x: 1 });
    nudge('NO-SUCH-ID', 'W', { x: 1 });

    expect(appStore.get()).toBe(state);
  });
});

describe('nudgeLayoutItemUseCase.canNudge()', () => {
  it('tells whether a step would change the layout', async () => {
    const { nudge } = await setup({ w: 4, h: 3 });

    expect(nudge.canNudge('WF', 'W', { x: -1 })).toBe(true);
    expect(nudge.canNudge('WF', 'W', { w: -1 })).toBe(false); // at the minimum width
    expect(nudge.canNudge('WF', 'NO-SUCH-ID', { x: 1 })).toBe(false);
  });

  it('grows a widget at the right edge of the grid to the left', async () => {
    const { rect, nudge } = await setup();
    nudge('WF', 'W', { x: 26 }); // x 28, w 4: touches the right edge (32 columns)

    nudge('WF', 'W', { w: 1 });
    expect(rect()).toEqual({ x: 27, y: 2, w: 5, h: 3 });

    nudge('WF', 'W', { w: -1 }); // undoes it
    expect(rect()).toEqual({ x: 28, y: 2, w: 4, h: 3 });
  });
});
