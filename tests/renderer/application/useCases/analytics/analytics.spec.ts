/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { createOpenAnalyticsUseCase } from '@/application/useCases/analytics/openAnalytics';
import { mockDialogProvider } from '@tests/infra/mocks/dialogProvider';

const entities = { projects: [], workflows: [], widgets: [] };

function setup(openFails = false) {
  const calls: string[] = [];
  const flushTelemetryUseCase = jest.fn(async () => { calls.push('flush'); });
  const openAnalyticsInBrowser = jest.fn(async () => {
    calls.push('open');
    if (openFails) {
      throw new Error('boom');
    }
  });
  const dialogProvider = mockDialogProvider({ showMessageBox: jest.fn(async () => ({ response: 0, checkboxChecked: false })) });
  const openAnalyticsUseCase = createOpenAnalyticsUseCase({
    flushTelemetryUseCase,
    getTelemetryEntitiesUseCase: () => entities,
    dialogProvider,
    openAnalyticsInBrowser,
  });
  return { openAnalyticsUseCase, openAnalyticsInBrowser, dialogProvider, calls };
}

describe('openAnalyticsUseCase', () => {
  it('flushes, then opens the browser page with the entity snapshot', async () => {
    const { openAnalyticsUseCase, openAnalyticsInBrowser, dialogProvider, calls } = setup();

    await openAnalyticsUseCase();

    expect(calls).toEqual(['flush', 'open']);
    expect(openAnalyticsInBrowser).toHaveBeenCalledWith(entities);
    expect(dialogProvider.showMessageBox).not.toHaveBeenCalled();
  });

  it('reports a failed open instead of throwing', async () => {
    const { openAnalyticsUseCase, dialogProvider } = setup(true);

    await expect(openAnalyticsUseCase()).resolves.toBeUndefined();
    expect(dialogProvider.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });
})
