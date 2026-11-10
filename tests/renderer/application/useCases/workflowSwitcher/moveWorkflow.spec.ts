/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createMoveWorkflowUseCase } from '@/application/useCases/workflowSwitcher/moveWorkflow';
import { fixtureAppState } from '@tests/base/state/fixtures/appState';
import { fixtureProjectAInColl } from '@tests/base/state/fixtures/entitiesState';
import { fixtureAppStore } from '@tests/data/fixtures/appStore';

async function setup() {
  const [appStore] = await fixtureAppStore(fixtureAppState({
    entities: { projects: fixtureProjectAInColl({ id: 'P', workflowIds: ['A', 'B', 'C'] }) }
  }));
  return { appStore, moveWorkflowUseCase: createMoveWorkflowUseCase({ appStore }) };
}

describe('moveWorkflowUseCase()', () => {
  it('moves a workflow one place back or forward in its project', async () => {
    const { appStore, moveWorkflowUseCase } = await setup();

    moveWorkflowUseCase('P', 'B', -1);
    expect(appStore.get().entities.projects['P']?.workflowIds).toEqual(['B', 'A', 'C']);

    moveWorkflowUseCase('P', 'B', 1);
    expect(appStore.get().entities.projects['P']?.workflowIds).toEqual(['A', 'B', 'C']);
  });

  it('does nothing past either end, or for an unknown project or workflow', async () => {
    const { appStore, moveWorkflowUseCase } = await setup();
    const state = appStore.get();

    moveWorkflowUseCase('P', 'A', -1);
    moveWorkflowUseCase('P', 'C', 1);
    moveWorkflowUseCase('P', 'X', 1);
    moveWorkflowUseCase('NO-SUCH-ID', 'A', 1);

    expect(appStore.get()).toBe(state);
  });
});
